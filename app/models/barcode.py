from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Barcode(Base):
    __tablename__ = "barcodes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    quantity = Column(Integer, nullable=False)

    # Внешние ключи
    supply_id = Column(Integer, ForeignKey("supplies.id"), nullable=True)
    production_id = Column(Integer, ForeignKey("productions.id"), nullable=True)
    consumable_id = Column(Integer, ForeignKey("consumables.id"), nullable=True)
    
    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True)

    # Связи
    supplies = relationship("Supply", back_populates="barcode")
    productions = relationship("Production", back_populates="barcode")
    consumables = relationship("Consumable", back_populates="barcode")
    cell = relationship("Cell", back_populates="barcode")