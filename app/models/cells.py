from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.orm import relationship
from app.database import Base


class Cell(Base):
    __tablename__ = "cells"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    capacity = Column(Float, default=0.0)

    items = relationship("Item", back_populates="cell")
    batches = relationship("Batch", back_populates="cell")
    barcode = relationship("Barcode", back_populates="cell", uselist=False)
    receivings = relationship("Receiving", back_populates="cells")