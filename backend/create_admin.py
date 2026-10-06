"""Run locally: python create_admin.py. No public admin-creation endpoint exists."""
from getpass import getpass
from sqlalchemy import select
from app.db import Base, engine, SessionLocal, User
from app.security import hash_password
from app.schemas import Signup
from pydantic import ValidationError

def main():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.role=='admin')):
            print('Admin already exists. No second admin was created.');return
        try:
            data=Signup(name=input('Admin name: ').strip(),email=input('Admin email: ').strip(),password=getpass('Password (minimum 12 characters): '))
        except ValidationError:
            print('Invalid input. Enter a valid email, name and a password of 12-128 characters.');return
        if data.password!=getpass('Confirm password: '):print('Passwords do not match.');return
        if db.scalar(select(User).where(User.email==str(data.email).lower())):
            print('This email is already registered. Use a different admin email.');return
        db.add(User(name=data.name,email=str(data.email).lower(),password_hash=hash_password(data.password),role='admin'));db.commit()
        print('Admin created. Log in from the website using this email and password.')
if __name__=='__main__':main()
