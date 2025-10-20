from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Consumable, Size, Cell, Manufacturer, Material, Unit

router = APIRouter(prefix="/catalogs/consumables", tags=["catalogs", "consumables"])
templates = Jinja2Templates(directory="app/templates")


# List Consumables
@router.get("/", response_class=HTMLResponse)
async def list_consumables(request: Request, db: Session = Depends(get_db)):
    consumables = db.query(Consumable).all()
    return templates.TemplateResponse(
        "catalogs/consumables/list.html",
        {"request": request, "consumables": consumables},
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
    size_id: int = Form(...),
    cell_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    consumable = Consumable(
        name=name,
        description=description,
        size_id=size_id,
        manufacturer_id=manufacturer_id,
        material_id=material_id,
        unit_id=unit_id,
        quantity=quantity,
    )
    db.add(consumable)
    db.commit()
    db.refresh(consumable)

    if cell_id:
        cell = db.query(Cell).filter(Cell.id == cell_id).first()
        cell.consumables = consumable
        db.commit()
        

    return RedirectResponse("/catalogs/consumables/", status_code=status.HTTP_303_SEE_OTHER)


# Edit Consumable
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


@router.post("/{consumable_id}/edit", response_class=HTMLResponse)
async def edit_consumable(
    request: Request,
    consumable_id: int,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(...),
    cell_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not consumable:
        raise HTTPException(404, "Consumable not found")

    consumable.name = name
    consumable.description = description
    consumable.size_id = size_id
    consumable.manufacturer_id = manufacturer_id
    consumable.material_id = material_id
    consumable.unit_id = unit_id
    consumable.quantity = quantity

    db.commit()
    
    if cell_id:
        cell = db.query(Cell).filter(Cell.id == cell_id).first()
        cell.consumables = consumable
                
    return RedirectResponse(f"/catalogs/consumables/{consumable_id}", status_code=status.HTTP_303_SEE_OTHER)


# Delete Consumable
@router.post("/{consumable_id}/delete", response_class=HTMLResponse)
async def delete_consumable(consumable_id: int, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
    if not consumable:
        raise HTTPException(404, "Consumable not found")
    db.delete(consumable)
    db.commit()
    return RedirectResponse("/catalogs/consumables/", status_code=status.HTTP_303_SEE_OTHER)