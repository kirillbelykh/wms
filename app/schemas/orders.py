from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional

class OrderBase(BaseModel):
    name: str = Field(..., max_length=255)
    type: str = Field(..., description="Тип заказа: receiving, shipping, movement")
    description: Optional[str] = None
    quantity: int = Field(..., gt=0)

    @field_validator("type")
    @classmethod
    def validate_type(cls, v):
        allowed = {"receiving", "shipping", "movement"}
        if v not in allowed:
            raise ValueError(f"Тип заказа должен быть одним из {allowed}")
        return v

class OrderCreate(OrderBase):
    pass

class OrderUpdate(BaseModel):
    name: Optional[str]
    type: Optional[str]
    description: Optional[str]
    quantity: Optional[int]

    @field_validator("type")
    @classmethod
    def validate_type(cls, v):
        if v is None:
            return v
        allowed = {"receiving", "shipping", "movement"}
        if v not in allowed:
            raise ValueError(f"Тип заказа должен быть одним из {allowed}")
        return v

class OrderOut(OrderBase):
    id: int
    status: str
    created_at: datetime
    end_at: Optional[datetime]

    class Config:
        orm_mode = True