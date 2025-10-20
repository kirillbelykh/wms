from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base

class Cell(Base):
    __tablename__ = "cells"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    capacity = Column(Float, nullable=False)
    
    supply_id = Column(Integer, ForeignKey("supplies.id"), nullable=True)
    production_id = Column(Integer, ForeignKey("productions.id"), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    receiving_id = Column(Integer, ForeignKey("receivings.id"), nullable=True)

    supply = relationship("Supply", back_populates="cells")  # Corrected: scalar for one supply
    productions = relationship("Production", back_populates="cell")
    consumables = relationship("Consumable", back_populates="cell")
    batches = relationship("Batch", back_populates="cell")
    barcode = relationship("Barcode", back_populates="cell")
    receivings = relationship("Receiving", back_populates="cells")