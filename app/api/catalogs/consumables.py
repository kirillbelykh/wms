from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import Consumable, Size, Cell, Manufacturer, Material, Unit

router = APIRouter(prefix="/catalogs/consumables", tags=["catalogs", "consumables"])
templates = Jinja2Templates(directory="app/templates")


def parse_optional_int(value: str | None) -> Optional[int]:
    """Преобразует строку в int, пустые строки возвращает None"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


# List Consumables
@router.get("/", response_class=HTMLResponse)
async def list_consumables(request: Request, db: Session = Depends(get_db)):
    # Получаем все расходники
    consumables = db.query(Consumable).all()

    # Получаем первую ячейку для каждого расходника (если есть)
    consumables_with_cells = []
    for c in consumables:
        cell = db.query(Cell).filter(Cell.consumable_id == c.id).first()
        consumables_with_cells.append({"consumable": c, "cell": cell})

    return templates.TemplateResponse(
        "catalogs/consumables/list.html",
        {"request": request, "items": consumables_with_cells},
    )
    
# Create Consumable Form
@router.get("/create", response_class=HTMLResponse)
async def create_consumable_form(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "quantity": 0,
    }
    return templates.TemplateResponse("catalogs/consumables/create.html", ctx)


# Create Consumable
@router.post("/create")
async def create_consumable(
    request: Request,
    name: str = Form(...),
    description: str = Form(...),
    size_id: str = Form(None),
    cell_id: str = Form(None),
    manufacturer_id: str = Form(None),
    material_id: str = Form(None),
    unit_id: str = Form(None),
    quantity: float = Form(0),
    db: Session = Depends(get_db),
):
    consumable = Consumable(
        name=name,
        description=description,
        size_id=parse_optional_int(size_id),
        manufacturer_id=parse_optional_int(manufacturer_id),
        material_id=parse_optional_int(material_id),
        unit_id=parse_optional_int(unit_id),
        quantity=quantity,
    )
    db.add(consumable)
    db.commit()
    db.refresh(consumable)

    cell_id_parsed = parse_optional_int(cell_id)
    if cell_id_parsed:
        cell = db.query(Cell).filter(Cell.id == cell_id_parsed).first()
        if cell:
            cell.consumable_id = consumable.id
            db.commit()

    return RedirectResponse("/catalogs/consumables/", status_code=status.HTTP_303_SEE_OTHER)


# Edit Consumable Form
@router.get("/{consumable_id}/edit", response_class=HTMLResponse)
async def edit_consumable_form(request: Request, consumable_id: int, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not consumable:
        raise HTTPException(404, "Consumable not found")
    ctx = {
        "request": request,
        "consumable": consumable,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
    }
    return templates.TemplateResponse("catalogs/consumables/edit.html", ctx)


# Edit Consumable
@router.post("/{consumable_id}/edit", response_class=HTMLResponse)
async def edit_consumable(
    request: Request,
    consumable_id: int,
    name: str = Form(...),
    description: str = Form(...),
    size_id: str = Form(None),
    cell_id: str = Form(None),
    manufacturer_id: str = Form(None),
    material_id: str = Form(None),
    unit_id: str = Form(None),
    quantity: float = Form(0),
    db: Session = Depends(get_db),
):
    consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not consumable:
        raise HTTPException(404, "Consumable not found")

    consumable.name = name
    consumable.description = description
    consumable.size_id = parse_optional_int(size_id)
    consumable.manufacturer_id = parse_optional_int(manufacturer_id)
    consumable.material_id = parse_optional_int(material_id)
    consumable.unit_id = parse_optional_int(unit_id)
    consumable.quantity = quantity
    db.commit()

    cell_id_parsed = parse_optional_int(cell_id)
    if cell_id_parsed:
        cell = db.query(Cell).filter(Cell.id == cell_id_parsed).first()
        if cell:
            cell.consumable_id = consumable.id
            db.commit()

    return RedirectResponse(f"/catalogs/consumables", status_code=status.HTTP_303_SEE_OTHER)


# Delete Consumable
@router.post("/{consumable_id}/delete", response_class=HTMLResponse)
async def delete_consumable(consumable_id: int, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not consumable:
        raise HTTPException(404, "Consumable not found")

    # Разорвать связи с ячейками
    cells = db.query(Cell).filter(Cell.consumable_id == consumable.id).all()
    for cell in cells:
        cell.consumable_id = None

    db.delete(consumable)
    db.commit()

    return RedirectResponse("/catalogs/consumables/", status_code=status.HTTP_303_SEE_OTHER)