from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    status = Column(String, nullable=False, default="pending")
    type = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=True)

    items = relationship("Item", back_populates="order")
    batches = relationship("Batch", back_populates="order")
    receivings = relationship("Receiving", back_populates="order")