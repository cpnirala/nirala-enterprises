"""Integration flow test. Uses an isolated SQLite file, never the configured customer database."""
import os, tempfile
from pathlib import Path
import pytest
TMP = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL']='sqlite:///'+str(Path(TMP.name)/'test.db')
os.environ['ALLOWED_ORIGINS']='http://testserver'
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.db import Base, engine, SessionLocal, User, Product, Order
from app.security import hash_password
from app.main import app, UPLOADS
from PIL import Image
import io

@pytest.fixture()
def clients():
    Base.metadata.drop_all(engine);Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(User(name='Owner',email='admin@example.com',password_hash=hash_password('Admin-password-123'),role='admin'));db.commit()
    with TestClient(app,headers={'Origin':'http://testserver'}) as owner, TestClient(app,headers={'Origin':'http://testserver'}) as customer, TestClient(app,headers={'Origin':'http://testserver'}) as other:
        assert owner.post('/api/auth/login',json={'email':'admin@example.com','password':'Admin-password-123'}).status_code==200
        for client,email in [(customer,'customer@example.com'),(other,'other@example.com')]:
            r=client.post('/api/auth/signup',json={'name':'Customer','email':email,'password':'Customer-pass-123'})
            assert r.status_code==201,r.text
            assert 'HttpOnly' in r.headers['set-cookie']
        yield owner,customer,other

def test_order_security_stock_and_moderation(clients):
    owner,customer,other=clients
    assert customer.get('/api/admin/orders').status_code==403
    assert customer.post('/api/auth/signup',json={'name':'Bad','email':'bad@example.com','password':'Password-12345','role':'admin'}).status_code==422
    body={'name':'Test extinguisher','category':'Fire','description':'A test product','price_paise':125050,'stock':3,'image':'/images/fire-extinguishers.webp','active':True}
    p=owner.post('/api/admin/products',json=body)
    assert p.status_code==201,p.text
    id=p.json()['id']
    assert customer.put(f'/api/cart/{id}',json={'quantity':4}).status_code==409
    assert customer.put(f'/api/cart/{id}',json={'quantity':2}).status_code==200
    request={'name':'Customer','phone':'9912345678','address':'House 10, Chandigarh, Punjab 160001','notes':'Call before delivery','request_key':'request-1234567890'}
    assert customer.post('/api/orders',json={**request,'total_paise':1}).status_code==422
    order=customer.post('/api/orders',json=request)
    assert order.status_code==201,order.text
    o=order.json();assert o['total_paise']==250100
    assert customer.post('/api/orders',json=request).json()['id']==o['id']
    assert customer.get('/api/cart').json()==[]
    assert other.get('/api/orders').json()==[]
    assert owner.get('/api/admin/products').json()[0]['stock']==1
    assert owner.patch('/api/admin/orders/'+str(o['id']),json={'status':'Completed'}).status_code==409
    assert owner.patch('/api/admin/orders/'+str(o['id']),json={'status':'Cancelled'}).status_code==200
    assert owner.patch('/api/admin/orders/'+str(o['id']),json={'status':'Cancelled'}).status_code==200
    assert owner.get('/api/admin/products').json()[0]['stock']==3
    r=customer.put('/api/testimonials/mine',json={'rating':5,'comment':'Helpful equipment advice and service.'})
    assert r.status_code==200,r.text
    assert other.get('/api/testimonials').json()==[]
    rid=r.json()['id']
    assert customer.patch('/api/admin/testimonials/'+str(rid),json={'status':'approved'}).status_code==403
    assert owner.patch('/api/admin/testimonials/'+str(rid),json={'status':'approved'}).status_code==200
    assert len(other.get('/api/testimonials').json())==1
    assert customer.put('/api/testimonials/mine',json={'rating':4,'comment':'Updated review needs fresh approval.'}).status_code==200
    assert other.get('/api/testimonials').json()==[]
    assert customer.post('/api/auth/logout').status_code==200
    assert customer.get('/api/orders').status_code==401

def test_upload_clients_origin_and_archive(clients):
    owner,customer,other=clients
    assert owner.post('/api/admin/uploads',files={'file':('bad.svg',b'<svg></svg>','image/svg+xml')}).status_code==400
    buf=io.BytesIO();Image.new('RGB',(10,10),'red').save(buf,format='PNG')
    result=owner.post('/api/admin/uploads',files={'file':('test.png',buf.getvalue(),'image/png')})
    assert result.status_code==200,result.text
    path=result.json()['url']
    try:
        assert owner.get(path).status_code==200
        assert customer.post('/api/admin/clients',json={'name':'Company','logo':path}).status_code==403
        r=owner.post('/api/admin/clients',json={'name':'Company','logo':path})
        assert r.status_code==201,r.text
        assert len(customer.get('/api/clients').json())==1
        assert owner.put('/api/admin/clients/'+str(r.json()['id']),json={'name':'Updated Company','logo':path}).status_code==200
        assert owner.post('/api/admin/clients',json={'name':'Bad image','logo':'javascript:alert(1)'}).status_code==422
        assert owner.post('/api/admin/clients',headers={'Origin':'http://evil.example'},json={'name':'Not allowed','logo':''}).status_code==403
        assert owner.delete('/api/admin/clients/'+str(r.json()['id'])).status_code==200
        p=owner.post('/api/admin/products',json={'name':'Test item','category':'Fire','description':'Test product','price_paise':10000,'stock':2}).json()
        customer.put('/api/cart/'+str(p['id']),json={'quantity':1})
        owner.delete('/api/admin/products/'+str(p['id']))
        assert customer.get('/api/products').json()==[]
        assert customer.post('/api/orders',json={'name':'Customer','phone':'9912345678','address':'Long full address Chandigarh 160001','request_key':'request-archived-123'}).status_code==409
    finally:(UPLOADS/path.split('/')[-1]).unlink(missing_ok=True)
