from app.database import Base
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship


class Barcode(Base):
    __tablename__ = "barcodes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    quantity = Column(Integer, nullable=False)

    # связи
    item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True)

    item = relationship("Item", back_populates="barcode")
    cell = relationship("Cell", back_populates="barcode")