from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base

class Consumable(Base):
    __tablename__ = "consumables"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    quantity = Column(Float, default=0.0)

    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)

    size = relationship("Size", back_populates="consumables")
    cell = relationship("Cell", back_populates="consumable")
    manufacturer = relationship("Manufacturer", back_populates="consumables")
    material = relationship("Material", back_populates="consumables")
    unit = relationship("Unit", back_populates="consumables")
    barcode = relationship("Barcode", back_populates="consumables", uselist=False)
    batches = relationship("Batch", back_populates="consumable")
    receivings = relationship("Receiving", back_populates="consumables")