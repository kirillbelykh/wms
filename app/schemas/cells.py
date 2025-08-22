from pydantic import BaseModel, Field

class Cell(BaseModel):
    id: int = Field(..., description="The unique identifier of the cell")
    name: str = Field(..., max_length=100, description="The name of the cell")
    value: str = Field(None, max_length=500, description="The value contained in the cell")

    class Config:
        orm_mode = True
        schema_extra = {
            "example": {
                "id": 1,
                "name": "Sample Cell",
                "value": "This is a sample cell value."
            }
        }