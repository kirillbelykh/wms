from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base

class Supply(Base):
    __tablename__ = "supplies"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, unique=False)
    description = Column(String, nullable=True)
    quantity = Column(Float, default=0.0)

    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)

    size = relationship("Size", back_populates="supplies")
    cells = relationship("Cell", back_populates="supply")  # Corrected: collection for many cells
    manufacturer = relationship("Manufacturer", back_populates="supplies")
    material = relationship("Material", back_populates="supplies")
    unit = relationship("Unit", back_populates="supplies")
    barcode = relationship("Barcode", back_populates="supplies", uselist=False)
    batches = relationship("Batch", back_populates="supply")
    receivings = relationship("Receiving", back_populates="supplies")
    