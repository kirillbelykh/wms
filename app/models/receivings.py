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

    supply_id = Column(Integer, ForeignKey("supplies.id"), nullable=True)
    production_id = Column(Integer, ForeignKey("productions.id"), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    
    
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    supplies = relationship("Supply", back_populates="receivings")
    productions = relationship("Production", back_populates="receivings")
    consumables = relationship("Consumable", back_populates="receivings")
    
    cells = relationship("Cell", back_populates="receivings")
    manufacturer = relationship("Manufacturer", back_populates="receivings")