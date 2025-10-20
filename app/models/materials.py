from app.database import Base
from sqlalchemy import Column, String, Integer
from sqlalchemy.orm import relationship


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    supplies = relationship("Supply", back_populates="material")
    productions = relationship("Production", back_populates="material")
    consumables = relationship("Consumable", back_populates="material")
    