# app/models/consumable.py
from sqlalchemy import Column, Integer, ForeignKey
from app.models.item_base import Item

class Consumable(Item):
    __tablename__ = "consumables"
    id = Column(Integer, ForeignKey('items.id'), primary_key=True)

    # специфичные поля для расходников