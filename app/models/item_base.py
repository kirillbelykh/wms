# app/models/item.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, nullable=False)

    # Общие внешние ключи
    material_id = Column(Integer, ForeignKey('materials.id'))
    size_id = Column(Integer, ForeignKey('sizes.id'))
    unit_id = Column(Integer, ForeignKey('units.id'))
    manufacturer_id = Column(Integer, ForeignKey('manufacturers.id'))

    # Общие связи
    cells = relationship("Cell", back_populates="item")
    receivings = relationship("Receiving", back_populates="item")
    material = relationship("Material", back_populates="items")
    size = relationship("Size", back_populates="items")
    unit = relationship("Unit", back_populates="items")
    manufacturer = relationship("Manufacturer", back_populates="items")