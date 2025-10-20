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
    
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    
    
    cell = relationship("Cell", back_populates="batches")
    item = relationship("Item", back_populates="batch")