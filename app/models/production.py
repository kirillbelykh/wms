# app/models/production.py
from sqlalchemy import Column, Integer, ForeignKey
from app.models.item_base import Item

class Production(Item):
    __tablename__ = "productions"
    id = Column(Integer, ForeignKey('items.id'), primary_key=True)

    # можно добавить специфичные поля для готовой продукции