from sqlalchemy import Column, ForeignKey, Integer, String, Float
from sqlalchemy.orm import relationship
from database.db import Base

class Cell(Base):
    __tablename__ = 'cells'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    capacity = Column(Float, default=0.0)

    # relationships
    item_id = Column(Integer, ForeignKey('items.id'))
    item = relationship("Item", back_populates="cells")
    batches = relationship("Batch", back_populates="cell")
    
    