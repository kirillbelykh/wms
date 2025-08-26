from app.database import Base
from sqlalchemy import Column, String, Integer
from sqlalchemy.orm import relationship


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    items = relationship("Item", back_populates="material")