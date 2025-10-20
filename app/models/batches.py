from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Integer, nullable=False, unique=True)
    description = Column(String, nullable=True)
    quantity = Column(Integer, default=0.0)
    manufacture_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    
    supply_id = Column(Integer, ForeignKey("supplies.id"), nullable=True)
    production_id = Column(Integer, ForeignKey("productions.id"), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    
    supply = relationship("Supply", back_populates="batches")
    production = relationship("Production", back_populates="batches")
    consumable = relationship("Consumable", back_populates="batches")
    cell = relationship("Cell", back_populates="batches")
