from pydantic import BaseModel, Field, field_validator
from typing import Optional

class ItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название товара")
    description: Optional[str] = Field(None, max_length=255, description="Описание товара")

    # Валидация через field_validator (Pydantic v2)
    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class ItemCreate(ItemBase):
    """Схема для создания товара"""
    pass


class ItemResponse(ItemBase):
    id: int

    class Config:
        from_attributes = True  # для работы с ORM