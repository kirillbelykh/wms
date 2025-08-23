from pydantic import BaseModel, Field, field_validator

class BatchBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str | None = Field(None, max_length=255)
    quantity: int = Field(..., gt=0, description="Количество должно быть больше 0")
    cell_id: int = Field(..., gt=0)
    item_id: int = Field(..., gt=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("description")
    @classmethod
    def strip_description(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class BatchCreate(BatchBase):
    pass


class BatchRead(BatchBase):
    id: int

    class Config:
        from_attributes = True