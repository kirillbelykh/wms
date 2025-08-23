from pydantic import BaseModel, Field
from typing import Annotated, Optional

class ReceivingCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, strip_whitespace=True)]
    quantity: Annotated[int, Field(gt=0)]
    order_id: Annotated[int, Field(gt=0)]
    item_id: Annotated[int, Field(gt=0)]
    barcode: Annotated[str, Field(min_length=3, max_length=50, strip_whitespace=True)]
    country: Optional[str] = None
    type_: Optional[str] = Field(None, alias="type")
    unit_of_measure: Optional[str] = None
    comments: Optional[str] = None