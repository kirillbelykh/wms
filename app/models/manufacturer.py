from app.database import Base
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    country = Column(String, nullable=True)

    items = relationship("Item", back_populates="manufacturer")
    receivings = relationship("Receiving", back_populates="manufacturer")