from app.database import Base
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime


class Receiving(Base):
    __tablename__ = "receivings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=True)
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_at = Column(DateTime, nullable=True)
    comments = Column(String, nullable=True)

    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)

    items = relationship("Item", back_populates="receivings")
    cells = relationship("Cell", back_populates="receivings")
    manufacturer = relationship("Manufacturer", back_populates="receivings")