from app.database import Base
from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship


# models/item.py
class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    quantity = Column(Integer, default=0.0)
    
    manufacturer_id = Column(Integer, ForeignKey("manufacturers.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    size_id = Column(Integer, ForeignKey("sizes.id"), nullable=True)
    item_type_id = Column(Integer, ForeignKey("item_types.id"), nullable=True)

    cell = relationship("Cell", back_populates="items")
    batch = relationship("Batch", back_populates="item")
    receivings = relationship("Receiving", back_populates="items")
    manufacturer = relationship("Manufacturer", back_populates="items")
    material = relationship("Material", back_populates="items")
    unit = relationship("Unit", back_populates="items")
    barcode = relationship("Barcode", back_populates="item", uselist=False)
    item_type = relationship("ItemType", back_populates="items")  # ← исправлено
    sizes = relationship("Size", back_populates="items")
    
    @property
    def full_name(self):
        t = self.item_type.name if self.item_type else ""
        if t == "Сырье":
            return f"{self.manufacturer.name if self.manufacturer else ''} " \
                   f"{self.material.name if self.material else ''} " \
                   f"{self.name or ''} " \
                   f"{self.sizes.name if self.sizes else ''}".strip()
                   
        elif t == "Готовая продукция":
            return f"{self.name or ''} " \
                   f"{self.material.name if self.material else ''} " \
                   f"{self.sizes.name if self.sizes else ''} " \
                   f"{self.batches.name if self.batches else ''}".strip()
        elif t == "Расходник":
            return f"{self.name or ''} {self.sizes.name if self.sizes else ''}".strip()
        return self.name
    
    