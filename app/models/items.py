from app.database import Base
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)

    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True)
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True)
    item_type_id = Column(Integer, ForeignKey("item_types.id"), nullable=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)

    order = relationship("Order", back_populates="items")
    cell = relationship("Cell", back_populates="items")
    batches = relationship("Batch", back_populates="item")
    receivings = relationship("Receiving", back_populates="item")
    manufacturer = relationship("Manufacturer", back_populates="items")
    material = relationship("Material", back_populates="items")
    unit = relationship("Unit", back_populates="items")
    barcode = relationship("Barcode", back_populates="item", uselist=False)
    item_types = relationship("ItemType", back_populates="items")
    sizes = relationship("Size", back_populates="items")