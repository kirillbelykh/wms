# app/models/supply.py
from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.models.item_base import Item

class Supply(Item):
    __tablename__ = "supplies"
    id = Column(Integer, ForeignKey('items.id'), primary_key=True)

    # Специфичные связи
    batches = relationship("Batch", back_populates="supply")  # партии