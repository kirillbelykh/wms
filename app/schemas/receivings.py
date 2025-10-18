from pydantic import BaseModel
from typing import Optional


class ReceivingCreate(BaseModel):
    name: Optional[str] = None
    comments: Optional[str] = None
    item_id: int
    cell_id: Optional[int] = None
    manufacturer_id: Optional[int] = None