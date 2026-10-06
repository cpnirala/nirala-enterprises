import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
from sqlalchemy import create_engine, String, Integer, BigInteger, Boolean, DateTime, ForeignKey, JSON, Index, text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
URL = os.environ.get('DATABASE_URL')
if not URL:
    raise RuntimeError('DATABASE_URL missing. Run python setup_local.py from the project root first.')
engine = create_engine(URL, pool_pre_ping=True, **({'connect_args': {'check_same_thread': False}} if URL.startswith('sqlite') else {}))
SessionLocal = sessionmaker(engine, expire_on_commit=False)
def now(): return datetime.now(timezone.utc).replace(tzinfo=None)
class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default='customer')
    __table_args__ = (Index('one_admin_only', 'role', unique=True, postgresql_where=text("role = 'admin'"), sqlite_where=text("role = 'admin'")),)
class LoginSession(Base):
    __tablename__ = 'login_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    expires: Mapped[datetime] = mapped_column(DateTime)
class Product(Base):
    __tablename__ = 'products'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(3000))
    price_paise: Mapped[int] = mapped_column(Integer)
    stock: Mapped[int] = mapped_column(Integer)
    image: Mapped[str] = mapped_column(String(300), default='')
    active: Mapped[bool] = mapped_column(Boolean, default=True)
class Cart(Base):
    __tablename__ = 'cart'
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey('products.id'), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
class Order(Base):
    __tablename__ = 'orders'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'))
    request_key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20))
    address: Mapped[str] = mapped_column(String(600))
    notes: Mapped[str] = mapped_column(String(1000), default='')
    items: Mapped[list] = mapped_column(JSON)
    total_paise: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(30), default='Pending confirmation')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    __table_args__ = (UniqueConstraint('user_id', 'request_key'),)
class Client(Base):
    __tablename__ = 'clients'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    logo: Mapped[str] = mapped_column(String(300), default='')
class Testimonial(Base):
    __tablename__ = 'testimonials'
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id'), unique=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(String(1500))
    status: Mapped[str] = mapped_column(String(20), default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

def get_db():
    with SessionLocal() as db: yield db
