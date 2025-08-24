from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    status = Column(String, nullable=False, default="pending")
    type = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    receivings = relationship("Receiving", back_populates="orders")
    items = relationship("Item", back_populates="orders")
    batches = relationship("Batch", back_populates="orders")