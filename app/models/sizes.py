from app.database import Base
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

class Size(Base):
    __tablename__ = 'sizes'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    items = relationship("Item", back_populates="size")