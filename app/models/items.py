from app.database import Base
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

class Item(Base):
    __tablename__ = 'items'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    quantity = Column(Float, default=0.0)
    
    #relationships
    cells = relationship("Cell", back_populates="items")
    batches = relationship("Batch", back_populates="items")
    
    