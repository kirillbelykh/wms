from pydantic import BaseModel, Field

class Item(BaseModel):
    id: int = Field(..., description="The unique identifier of the item")
    name: str = Field(..., max_length=100, description="The name of the item")
    description: str = Field(None, max_length=500, description="A brief description of the item")

    class Config:
        orm_mode = True
        schema_extra = {
            "example": {
                "id": 1,
                "name": "Sample Item",
                "description": "This is a sample item description."
            }
        }