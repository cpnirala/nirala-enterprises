import os, secrets, io, warnings, threading, time
from datetime import timedelta
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from PIL import Image, UnidentifiedImageError
from .db import Base, engine, get_db, ROOT, User, LoginSession, Product, Cart, Order, Client, Testimonial, now
from .security import hash_password, verify_password, token_hash
from .schemas import Signup, Login, ProductInput, ClientInput, CartInput, OrderInput, ReviewInput, ReviewStatus, OrderStatus

UPLOADS = ROOT / 'uploads'
UPLOADS.mkdir(exist_ok=True)
ORIGINS = set(os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000').split(','))
SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
COOKIE = 'nirala_session'
@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield
app = FastAPI(title='Nirala Enterprises API', lifespan=lifespan)
app.mount('/uploads', StaticFiles(directory=UPLOADS), name='uploads')
# Local single-process rate limiter. Use a shared limiter before multi-worker production deployment.
visits = defaultdict(deque)
rate_lock = threading.Lock()
@app.middleware('http')
async def guards(request, call_next):
    if request.method in {'POST','PUT','PATCH','DELETE'}:
        if request.headers.get('origin') not in ORIGINS:
            return JSONResponse({'detail':'Untrusted or missing request origin'}, status_code=403)
    if request.url.path in {'/api/auth/login','/api/auth/signup'}:
        key = (request.client.host, request.url.path)
        with rate_lock:
            t = time.monotonic()
            if len(visits) > 10000: visits.clear()
            q = visits[key]
            while q and q[0] < t - 60: q.popleft()
            if len(q) >= 20: return JSONResponse({'detail':'Too many attempts. Try again in a minute.'},status_code=429)
            q.append(t)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if request.url.path.startswith('/api'): response.headers['Cache-Control'] = 'no-store'
    return response

def current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    s = db.get(LoginSession, token_hash(token)) if token else None
    if not s or s.expires < now(): raise HTTPException(401, 'Please log in')
    user = db.get(User, s.user_id)
    if not user: raise HTTPException(401, 'Please log in')
    return user

def admin(user: User = Depends(current_user)):
    if user.role != 'admin': raise HTTPException(403, 'Admin access required')
    return user

def customer(user: User = Depends(current_user)):
    if user.role != 'customer': raise HTTPException(403, 'Use a customer account for this action')
    return user

def public_user(u): return {'id':u.id,'name':u.name,'email':u.email,'role':u.role}
def product_dict(p): return {k:getattr(p,k) for k in ('id','name','category','description','price_paise','stock','image','active')}
def order_dict(o): return {k:getattr(o,k) for k in ('id','user_id','name','phone','address','notes','items','total_paise','status','created_at')}
def row_or_404(db, model, id):
    obj=db.get(model,id)
    if not obj: raise HTTPException(404,'Not found')
    return obj

def start_session(db,user,response):
    token=secrets.token_urlsafe(32)
    db.execute(delete(LoginSession).where(LoginSession.expires < now()))
    db.add(LoginSession(token_hash=token_hash(token),user_id=user.id,expires=now()+timedelta(days=1)))
    db.commit()
    response.set_cookie(COOKIE,token,httponly=True,secure=SECURE,samesite='strict',max_age=86400,path='/')

@app.get('/api/health')
def health(db: Session=Depends(get_db)):
    db.execute(select(1)); return {'status':'ok'}
@app.post('/api/auth/signup',status_code=201)
def signup(data: Signup,response:Response,db:Session=Depends(get_db)):
    user=User(name=data.name,email=str(data.email).lower(),password_hash=hash_password(data.password),role='customer')
    db.add(user)
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409,'Email already registered')
    start_session(db,user,response); return public_user(user)
@app.post('/api/auth/login')
def login(data:Login,response:Response,db:Session=Depends(get_db)):
    user=db.scalar(select(User).where(User.email==str(data.email).lower()))
    if not user or not verify_password(data.password,user.password_hash): raise HTTPException(401,'Invalid email or password')
    start_session(db,user,response);return public_user(user)
@app.get('/api/auth/me')
def me(user:User=Depends(current_user)): return public_user(user)
@app.post('/api/auth/logout')
def logout(request:Request,response:Response,db:Session=Depends(get_db)):
    token=request.cookies.get(COOKIE)
    if token: db.execute(delete(LoginSession).where(LoginSession.token_hash==token_hash(token))); db.commit()
    response.delete_cookie(COOKIE,path='/'); return {'ok':True}

@app.get('/api/products')
def products(db:Session=Depends(get_db)):
    return [product_dict(p) for p in db.scalars(select(Product).where(Product.active==True).order_by(Product.id.desc()))]
@app.get('/api/admin/products',dependencies=[Depends(admin)])
def all_products(db:Session=Depends(get_db)):
    return [product_dict(p) for p in db.scalars(select(Product).order_by(Product.id.desc()))]
@app.post('/api/admin/products',dependencies=[Depends(admin)],status_code=201)
def add_product(data:ProductInput,db:Session=Depends(get_db)):
    p=Product(**data.model_dump());db.add(p);db.commit();return product_dict(p)
@app.put('/api/admin/products/{id}',dependencies=[Depends(admin)])
def edit_product(id:int,data:ProductInput,db:Session=Depends(get_db)):
    p=db.scalar(select(Product).where(Product.id==id).with_for_update())
    if not p: raise HTTPException(404,'Product not found')
    for k,v in data.model_dump().items():setattr(p,k,v)
    db.commit();return product_dict(p)
@app.delete('/api/admin/products/{id}',dependencies=[Depends(admin)])
def archive_product(id:int,db:Session=Depends(get_db)):
    p=db.scalar(select(Product).where(Product.id==id).with_for_update())
    if not p: raise HTTPException(404,'Product not found')
    p.active=False;db.commit();return {'ok':True}

@app.post('/api/admin/uploads',dependencies=[Depends(admin)])
async def upload(file:UploadFile=File(...)):
    raw=await file.read(5*1024*1024+1)
    await file.close()
    if len(raw)>5*1024*1024:raise HTTPException(413,'Image must be under 5 MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as im:
                if im.format not in {'JPEG','PNG','WEBP'} or im.width*im.height>16000000: raise ValueError()
                im.load();im=im.convert('RGB');im.thumbnail((1600,1600))
                name=secrets.token_hex(16)+'.webp';im.save(UPLOADS/name,'WEBP',quality=85)
    except (UnidentifiedImageError,ValueError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning):
        raise HTTPException(400,'Use a valid JPG, PNG or WebP image, at most 16 megapixels')
    return {'url':'/uploads/'+name}

@app.get('/api/cart')
def get_cart(user:User=Depends(customer),db:Session=Depends(get_db)):
    rows=db.execute(select(Cart,Product).join(Product,Cart.product_id==Product.id).where(Cart.user_id==user.id)).all()
    return [{'product':product_dict(p),'quantity':c.quantity} for c,p in rows]
@app.put('/api/cart/{product_id}')
def set_cart(product_id:int,data:CartInput,user:User=Depends(customer),db:Session=Depends(get_db)):
    db.scalar(select(User).where(User.id==user.id).with_for_update())
    line=db.get(Cart,(user.id,product_id))
    if data.quantity==0:
        if line:db.delete(line)
    else:
        p=row_or_404(db,Product,product_id)
        if not p.active or data.quantity>p.stock:raise HTTPException(409,'Product unavailable or insufficient stock')
        if line:line.quantity=data.quantity
        else:db.add(Cart(user_id=user.id,product_id=product_id,quantity=data.quantity))
    db.commit();return {'ok':True}
@app.post('/api/orders',status_code=201)
def place_order(data:OrderInput,user:User=Depends(customer),db:Session=Depends(get_db)):
    # Serializes checkout/cart updates per user and stock reservations per product.
    db.scalar(select(User).where(User.id==user.id).with_for_update())
    existing=db.scalar(select(Order).where(Order.user_id==user.id,Order.request_key==data.request_key))
    if existing:return order_dict(existing)
    lines=list(db.scalars(select(Cart).where(Cart.user_id==user.id).order_by(Cart.product_id)))
    if not lines:raise HTTPException(400,'Cart is empty')
    items=[]
    for line in lines:
        p=db.scalar(select(Product).where(Product.id==line.product_id).with_for_update())
        if not p or not p.active or p.stock<line.quantity:raise HTTPException(409,'Stock changed. Please review your cart.')
        items.append({'product_id':p.id,'name':p.name,'quantity':line.quantity,'price_paise':p.price_paise})
        p.stock-=line.quantity
    o=Order(user_id=user.id,items=items,total_paise=sum(i['quantity']*i['price_paise'] for i in items),**data.model_dump())
    db.add(o);db.execute(delete(Cart).where(Cart.user_id==user.id));db.commit();return order_dict(o)
@app.get('/api/orders')
def my_orders(user:User=Depends(customer),db:Session=Depends(get_db)):
    return [order_dict(o) for o in db.scalars(select(Order).where(Order.user_id==user.id).order_by(Order.id.desc()))]
@app.get('/api/admin/orders',dependencies=[Depends(admin)])
def all_orders(db:Session=Depends(get_db)):
    return [order_dict(o) for o in db.scalars(select(Order).order_by(Order.id.desc()))]
@app.patch('/api/admin/orders/{id}',dependencies=[Depends(admin)])
def update_order(id:int,data:OrderStatus,db:Session=Depends(get_db)):
    o=db.scalar(select(Order).where(Order.id==id).with_for_update())
    if not o:raise HTTPException(404,'Order not found')
    allowed={'Pending confirmation':{'Confirmed','Cancelled'},'Confirmed':{'Dispatched','Cancelled'},'Dispatched':{'Completed'},'Completed':set(),'Cancelled':set()}
    if data.status==o.status:return order_dict(o)
    if data.status not in allowed[o.status]:raise HTTPException(409,'This status transition is not allowed')
    if data.status=='Cancelled':
        for item in sorted(o.items,key=lambda i:i['product_id']):
            p=db.scalar(select(Product).where(Product.id==item['product_id']).with_for_update())
            p.stock+=item['quantity']
    o.status=data.status;db.commit();return order_dict(o)

@app.get('/api/clients')
def clients(db:Session=Depends(get_db)):
    return [{'id':c.id,'name':c.name,'logo':c.logo} for c in db.scalars(select(Client).order_by(Client.id.desc()))]
@app.post('/api/admin/clients',dependencies=[Depends(admin)],status_code=201)
def add_client(data:ClientInput,db:Session=Depends(get_db)):
    c=Client(**data.model_dump());db.add(c);db.commit();return {'id':c.id}
@app.put('/api/admin/clients/{id}',dependencies=[Depends(admin)])
def edit_client(id:int,data:ClientInput,db:Session=Depends(get_db)):
    c=row_or_404(db,Client,id)
    for k,v in data.model_dump().items():setattr(c,k,v)
    db.commit();return {'ok':True}
@app.delete('/api/admin/clients/{id}',dependencies=[Depends(admin)])
def delete_client(id:int,db:Session=Depends(get_db)):
    db.delete(row_or_404(db,Client,id));db.commit();return {'ok':True}

def review_dict(r,u):return {'id':r.id,'name':u.name,'rating':r.rating,'comment':r.comment,'status':r.status}
@app.get('/api/testimonials')
def testimonials(db:Session=Depends(get_db)):
    return [review_dict(r,u) for r,u in db.execute(select(Testimonial,User).join(User,User.id==Testimonial.user_id).where(Testimonial.status=='approved').order_by(Testimonial.id.desc()))]
@app.get('/api/testimonials/mine')
def my_testimonial(user:User=Depends(customer),db:Session=Depends(get_db)):
    r=db.scalar(select(Testimonial).where(Testimonial.user_id==user.id))
    return review_dict(r,user) if r else None
@app.put('/api/testimonials/mine')
def write_testimonial(data:ReviewInput,user:User=Depends(customer),db:Session=Depends(get_db)):
    db.scalar(select(User).where(User.id==user.id).with_for_update())
    r=db.scalar(select(Testimonial).where(Testimonial.user_id==user.id))
    if not r:r=Testimonial(user_id=user.id);db.add(r)
    r.rating=data.rating;r.comment=data.comment;r.status='pending';db.commit();return review_dict(r,user)
@app.get('/api/admin/testimonials',dependencies=[Depends(admin)])
def review_queue(db:Session=Depends(get_db)):
    return [review_dict(r,u) for r,u in db.execute(select(Testimonial,User).join(User,User.id==Testimonial.user_id).order_by(Testimonial.id.desc()))]
@app.patch('/api/admin/testimonials/{id}',dependencies=[Depends(admin)])
def moderate(id:int,data:ReviewStatus,db:Session=Depends(get_db)):
    r=row_or_404(db,Testimonial,id);r.status=data.status;db.commit();return {'ok':True}
