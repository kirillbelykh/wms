from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Float, nullable=False)

    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)

    cell = relationship("Cell", back_populates="batches")
    item = relationship("Item", back_populates="batches")
    order = relationship("Order", back_populates="batches")