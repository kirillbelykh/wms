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
    items = db.query(Item).all()
    return templates.TemplateResponse("catalogs/items/list.html", {"request": request, "items": items})

# ----------------------
# Show create form
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def items_create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "types": db.query(ItemType).all(),
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
    type_id: int = Form(None),
    size_id: int = Form(None),
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    material_id: int = Form(None),
    unit_id: int = Form(None),
    db: Session = Depends(get_db),
):
    item = Item(
    name=name,
    description=description,
    item_type_id=type_id,   # правильно
    size_id=size_id,             # правильно
    cell_id=cell_id,
    manufacturer_id=manufacturer_id,
    material_id=material_id,
    unit_id=unit_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return RedirectResponse(url=f"/catalogs/items/{item.id}/", status_code=status.HTTP_303_SEE_OTHER)

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
        "types": db.query(ItemType).all(),
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
    type_id: str = Form(None),
    size_id: str = Form(None),
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    material_id: int = Form(None),
    unit_id: int = Form(None),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.name = name
    item.description = description
    item.cell_id = cell_id
    item.size_id = size_id
    item.item_type_id = type_id
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