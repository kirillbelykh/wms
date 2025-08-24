from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Batch(Base):
    __tablename__ = 'batches'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    quantity = Column(Float, nullable=False)

    cell_id = Column(Integer, ForeignKey('cells.id'), nullable=False)
    cells = relationship("Cell", back_populates="batches")
    item_id = Column(Integer, ForeignKey('items.id'), nullable=False)
    items = relationship("Item", back_populates="batches")
    orders = relationship("Order", back_populates="batches")
    