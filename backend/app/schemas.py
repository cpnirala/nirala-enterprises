from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Literal
import re
class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
class Signup(Input):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
class ProductInput(Input):
    name: str = Field(min_length=2,max_length=150)
    category: str = Field(min_length=2,max_length=80)
    description: str = Field(min_length=5,max_length=3000)
    price_paise: int = Field(gt=0,le=100000000)
    stock: int = Field(ge=0,le=100000)
    image: str = Field(default='',max_length=300)
    active: bool = True
    @field_validator('image')
    @classmethod
    def image_path(cls,v):
        if v and not re.fullmatch(r'/(?:uploads/[a-f0-9]{32}\.webp|images/[a-z-]+\.webp)',v):
            raise ValueError('Upload an image or use a bundled /images/*.webp image.')
        return v
class ClientInput(Input):
    name: str = Field(min_length=2,max_length=150)
    logo: str = Field(default='',max_length=300)
    _logo = field_validator('logo')(ProductInput.image_path.__func__)
class CartInput(Input):
    quantity: int = Field(ge=0,le=99)
class OrderInput(Input):
    request_key: str = Field(min_length=16,max_length=64,pattern=r'^[a-zA-Z0-9-]+$')
    name: str = Field(min_length=2,max_length=100)
    phone: str = Field(pattern=r'^\+?[0-9 ()-]{10,20}$')
    address: str = Field(min_length=15,max_length=600)
    notes: str = Field(default='',max_length=1000)
class ReviewInput(Input):
    rating: int = Field(ge=1,le=5)
    comment: str = Field(min_length=10,max_length=1500)
class ReviewStatus(Input):
    status: Literal['approved','rejected','pending']
class OrderStatus(Input):
    status: Literal['Confirmed','Dispatched','Completed','Cancelled']
