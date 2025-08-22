from pydantic import BaseModel, Field

class Batches(BaseModel):
    id: int = Field(..., description="The unique identifier of the batch")
    name: str = Field(..., max_length=100, description="The name of the batch")
    description: str = Field(None, max_length=500, description="A brief description of the batch")

    class Config:
        orm_mode = True
        schema_extra = {
            "example": {
                "id": 1,
                "name": "Sample Batch",
                "description": "This is a sample batch description."
            }
        }   