from app.database import Base
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

class ItemType(Base):
    __tablename__ = 'item_types'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    items = relationship("Item", back_populates="item_types")