from pydantic import BaseModel, Field, field_validator


class CellBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название ячейки")
    description: str | None = Field(None, max_length=255, description="Описание ячейки")
    capacity: float = Field(..., ge=0, description="Вместимость (неотрицательное число)")

    # Валидация имени — убираем пробелы
    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class CellCreate(CellBase):
    pass


class CellResponse(CellBase):
    id: int

    class Config:
        from_attributes = True