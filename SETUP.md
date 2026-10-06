# Nirala Enterprises — complete local application

React + Vite frontend, FastAPI backend and PostgreSQL database.
Local development project: it does not modify your earlier static website or hosted Site.
Online payments are intentionally absent. Checkout places an order request for manual confirmation.

## 1. ZIP extract karo

ZIP ke andar `nirala-enterprises-app` folder hai. Iski files is location par honi chahiye:

`C:\Users\HP\Desktop\nirala-enterprises-app`

Is folder ke andar directly `backend`, `frontend`, `compose.yaml`, `setup_local.py` aur `SETUP.md` dikhne chahiye. Agar ek aur same-name folder andar ban gaya hai toh uske contents outer folder mein move karo.

Purani static website ko delete karne ki zarurat nahi hai.

## 2. PostgreSQL start karo

Docker Desktop open karo aur engine running hone do. PowerShell:

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app
python setup_local.py
docker compose up -d
docker compose ps
```

`db` ka status `healthy` aana chahiye. Image download pehli baar kuch time le sakta hai.
Port 5544 is project ke liye hai, purane PostgreSQL projects ke 5432/5433 ports se alag.

`setup_local.py` random database password banata hai, root `.env` aur `backend\.env` mein settings save karta hai. Files pehle se hain toh overwrite nahi karta. In files ko GitHub par upload mat karo.

Agar Docker command missing hai, Docker Desktop install/start karna hoga. Agar existing local PostgreSQL use karna hai, `nirala` naam ka database/user create karke backend `.env` mein apni connection URL set karo; Docker steps skip ho sakte hain. A running PostgreSQL database is required.

## 3. Backend install aur admin create karo

Isi PowerShell mein:

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe create_admin.py
```

Prompt par apna admin name, email aur minimum 12-character password enter karo. Password type karte waqt terminal mein characters visible nahi honge. Password confirm karo.

Koi default admin password nahi hai. Ek admin already hai toh doosra admin create nahi hoga. Public signup sirf customer account banata hai.

Ab backend start karo:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Backend: http://127.0.0.1:8000/api/health
API docs: http://127.0.0.1:8000/docs

Is terminal ko open rakho. Venv activation ki zarurat nahi hai, kyunki commands seedha venv Python use karti hain.

## 4. Frontend start karo — NEW terminal

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app\frontend
npm install
npm run dev
```

Website: http://localhost:5173

IMPORTANT: `npm install` frontend folder mein chalana hai, root ya backend mein nahi. Is baar frontend mein package.json included hai.
Port 5173 busy ho toh pehle us port par chal raha apna Vite project Ctrl+C se stop karo. Backend uses 8000; stop any other local backend using that port first.

## 5. Admin kaise use karein

1. Website par Login / Sign up kholkar create_admin.py wale email/password se login karo.
2. Admin dashboard khulega.
3. Products tab: product name, category, description, price in rupees aur available stock enter karo.
4. Apni JPG/PNG/WebP image upload karo (max 5 MB, 16 megapixels), ya provided illustrative image select karo.
5. Save product click karo. Catalogue mein product dikhega.
6. Edit se details update karo. Archive se product public catalogue se hide hoga; existing orders preserved rahenge. Edit karke Visible in catalogue check karne se reactivate kar sakte ho.
7. Clients tab: company name/logo add, edit ya delete karo.
8. Orders tab: Pending confirmation -> Confirmed -> Dispatched -> Completed.
9. Pending/Confirmed order cancel karne par reserved stock once restore hota hai.
10. Testimonials tab: submitted reviews approve/reject karo.

Catalogue, clients aur testimonials start mein empty hain. Fake prices, clients aur reviews seed nahi kiye gaye. Pehle admin se actual product data add karo.

## 6. Customer flow

Admin logout karo. Customer account ek doosre email se Sign up karke banao. Chaaho toh incognito window mein customer test karo.

1. Products browse/search/category filter.
2. Add to cart, quantity update/remove.
3. Cart par name, mobile, full address aur optional note enter karo.
4. Place order request click karo.
5. Order 'Pending confirmation' status mein save hoga. Customer My orders mein status dekh sakta hai.
6. Admin customer se delivery, final charges aur payment arrangements manually confirm karega. App koi payment collect nahi karta.
7. Testimonials page par review submit karo; approval ke baad public hoga. Editing sends it for approval again.

Cart and orders server/database mein save hote hain. Product totals are calculated on the server; browser cannot set the price. Product price/availability checkout ke waqt recheck hoti hai. Delivery/taxes are not automatically calculated; final charges are manually confirmed.

## 7. Agli baar project start karna

Root folder:

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app
docker compose up -d
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

New terminal:

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app\frontend
npm run dev
```

Admin create aur installations dobara nahi karni hain. Stop servers with Ctrl+C; stop database with `docker compose stop` from root. Do not use `docker compose down -v` unless you intend to permanently delete this project's database.



| File | Purpose |
|---|---|
| frontend/src/App.jsx | Public pages, customer flows, admin dashboard |
| frontend/src/style.css | Design and responsive layout |
| frontend/src/main.jsx | React entry |
| frontend/vite.config.js | Local backend proxy |
| frontend/public/images | Included illustrative fire equipment images |
| backend/app/main.py | Routes, sessions, authorization, uploads, cart and orders |
| backend/app/db.py | Database connection and tables |
| backend/app/schemas.py | Input validation |
| backend/app/security.py | Password hashing |
| backend/create_admin.py | One-time local admin creation |
| backend/uploads | Admin-uploaded product/client images (created at runtime) |
| compose.yaml | Local PostgreSQL service and persistent volume |

## 9. Verification

Frontend build:

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app\frontend
npm run build
```

Backend integration tests (isolated temporary SQLite database, not your real data):

```powershell
cd C:\Users\HP\Desktop\nirala-enterprises-app\backend
.\.venv\Scripts\python.exe -m pytest -q
```

API mutation requests require an allowed Origin header. The website sends it automatically. For manual Swagger/API tests use a browser opened at an allowed origin, or set Origin: http://localhost:5173 in your API client. No public admin registration endpoint exists.

## 10. Scope and deployment notes

This is a tested local-development first version, not a deployed production store. Frontend build and automated API flows were verified in the development environment. Live PostgreSQL/Docker execution, Windows execution and full browser visual QA remain to be verified on your machine. PostgreSQL row locks are implemented for checkout/stock; SQLite flow tests do not prove concurrent PostgreSQL behavior.

- No online payment gateway, emails/SMS, password recovery or email verification is connected.
- One testimonial per customer; edits require approval again.
- Admin uploads are served from backend/uploads. Back up uploads together with the database.
- Session cookie expires after one day; logout invalidates its server record.
- Before internet deployment: HTTPS + COOKIE_SECURE=true, correct ALLOWED_ORIGINS, same-origin reverse proxy for /api and /uploads, managed secret storage, backups, database migrations and shared rate limiting. Database tables are initialized for this first version with create_all; later schema changes need migrations.
- Do not deploy PostgreSQL credentials to a frontend/static host. Both backend hosting and PostgreSQL hosting are required.

Reference docs: https://vite.dev/guide/ and https://fastapi.tiangolo.com/advanced/response-cookies/
