from sqlalchemy import Column, Integer, String, Float, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base

class Production(Base):
    __tablename__ = "productions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, unique=False)
    description = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    quantity = Column(Float, default=0.0)
    
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    

    batches = relationship("Batch", back_populates="production")
    cell = relationship("Cell", back_populates="production")
    manufacturer = relationship("Manufacturer", back_populates="productions")
    material = relationship("Material", back_populates="productions")
    size = relationship("Size", back_populates="productions")
    unit = relationship("Unit", back_populates="productions")
    barcode = relationship("Barcode", back_populates="productions", uselist=False)
    receivings = relationship("Receiving", back_populates="productions")