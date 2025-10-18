from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Item, ItemType, Size, Cell, Manufacturer, Material, Unit, Batch, Barcode

router = APIRouter(prefix="/catalogs/items", tags=["catalogs:items"])
templates = Jinja2Templates(directory="app/templates")

# ----------------------
# List all items
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def items_list(request: Request, db: Session = Depends(get_db)):
    items = db.query(Item).join(ItemType).all()
    return templates.TemplateResponse(
        "catalogs/items/list.html",
        {"request": request, "items": items}
    )

# ----------------------
# Show create form
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def items_create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "item_types": db.query(ItemType).all(),  # Изменено: types -> item_types
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "batches": db.query(Batch).all(),
    }
    return templates.TemplateResponse("catalogs/items/create.html", ctx)

# ----------------------
# Create item
# ----------------------
@router.post("/create")
async def items_create(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    batch_id: str = Form(None),
    type_id: str = Form(None),
    size_id: str = Form(None),
    cell_id: str = Form(None),
    manufacturer_id: str = Form(None),
    material_id: str = Form(None),
    unit_id: str = Form(None),
    db: Session = Depends(get_db),
):
    def to_int_or_none(v):
        return int(v) if v and v.strip() != "" else None

    item = Item(
        name=name,
        description=description,
        batch_id=to_int_or_none(batch_id),
        item_type_id=to_int_or_none(type_id),
        size_id=to_int_or_none(size_id),
        cell_id=to_int_or_none(cell_id),
        manufacturer_id=to_int_or_none(manufacturer_id),
        material_id=to_int_or_none(material_id),
        unit_id=to_int_or_none(unit_id),
    )

    db.add(item)
    db.commit()
    db.refresh(item)
    return RedirectResponse(
        url=f"/catalogs/items/",
        status_code=status.HTTP_303_SEE_OTHER
    )
# ----------------------
# Detail / Edit item
# ----------------------
@router.get("/{item_id}/", response_class=HTMLResponse)
async def items_detail(item_id: int, request: Request, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    ctx = {
        "request": request,
        "item": item,
        "item_types": db.query(ItemType).all(),  # Изменено: types -> item_types
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "batches": db.query(Batch).all(),
        "barcode": db.query(Barcode).filter(Barcode.item_id == item_id).first(),
    }
    return templates.TemplateResponse("catalogs/items/edit.html", ctx)

# ----------------------
# Update item
# ----------------------
@router.post("/{item_id}/update")
async def items_update(
    item_id: int,
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    batch_id: int = Form(None),  # Исправлено: добавлен batch_id
    type_id: int = Form(None),   # Исправлено: int вместо str
    size_id: int = Form(None),   # Исправлено: int вместо str
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    material_id: int = Form(None),
    unit_id: int = Form(None),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    
    # Проверка на пустые значения
    batch_id = batch_id if batch_id else None
    type_id = type_id if type_id else None
    size_id = size_id if size_id else None
    cell_id = cell_id if cell_id else None
    manufacturer_id = manufacturer_id if manufacturer_id else None
    material_id = material_id if material_id else None
    unit_id = unit_id if unit_id else None

    item.name = name
    item.description = description
    item.batch_id = batch_id
    item.item_type_id = type_id
    item.size_id = size_id
    item.cell_id = cell_id
    item.manufacturer_id = manufacturer_id
    item.material_id = material_id
    item.unit_id = unit_id
    
    db.commit()
    db.refresh(item)
    return RedirectResponse(url=f"/catalogs/items/{item_id}/", status_code=status.HTTP_303_SEE_OTHER)

# ----------------------
# Delete item
# ----------------------
@router.get("/{item_id}/delete")
async def items_delete(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if item:
        db.delete(item)
        db.commit()
    return RedirectResponse(url="/catalogs/items/", status_code=status.HTTP_303_SEE_OTHER)