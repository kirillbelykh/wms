from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Cell(Base):
    __tablename__ = "cells"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    capacity = Column(Float, default=0.0)
    item_id = Column(Integer, ForeignKey('items.id'), nullable=True)
    batch_id = Column(Integer, ForeignKey('batches.id'), nullable=True)
    receiving_id = Column(Integer, ForeignKey('receivings.id'), nullable=True)

    items = relationship("Item", back_populates="cells")
    batches = relationship("Batch", back_populates="cell")
    barcode = relationship("Barcode", back_populates="cell", uselist=False)
    receivings = relationship("Receiving", back_populates="cells")