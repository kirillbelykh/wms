from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(Integer, nullable=False, unique=True)
    description = Column(String, nullable=True)
    quantity = Column(Float, nullable=True)

    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    cell = relationship("Cell", back_populates="batches")
    item = relationship("Item", back_populates="batches")
    order = relationship("Order", back_populates="batches")