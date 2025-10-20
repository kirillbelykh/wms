from app.database import Base
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    supplies = relationship("Supply", back_populates="unit")
    productions = relationship("Production", back_populates="unit")
    consumables = relationship("Consumable", back_populates="unit")
    
    