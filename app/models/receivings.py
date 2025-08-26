from app.database import Base
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship


class Receiving(Base):
    __tablename__ = "receivings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=True)
    quantity = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=True)
    country = Column(String, nullable=True)
    type = Column(String, nullable=True)
    unit_of_measure = Column(String, nullable=True)
    comments = Column(String, nullable=True)

    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)

    order = relationship("Order", back_populates="receivings")
    item = relationship("Item", back_populates="receivings")