from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Supply, Size, Cell, Manufacturer, Material, Unit

router = APIRouter(prefix="/catalogs/supplies", tags=["supplies"])

# Templates
from fastapi.templating import Jinja2Templates
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def list_supplies(request: Request, db: Session = Depends(get_db)):
    supplies = db.query(Supply).order_by(Supply.name).all()
    return templates.TemplateResponse("catalogs/supplies/list.html", {"request": request, "supplies": supplies})


@router.get("/create", response_class=HTMLResponse)
async def create_supply_form(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "quantity": 0,
    }
    return templates.TemplateResponse("catalogs/supplies/create.html", ctx)


@router.post("/create")
async def create_supply(
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(None),
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    material_id: int = Form(None),
    unit_id: int = Form(None),
    quantity: float = Form(0),
    db: Session = Depends(get_db),
):
    supply = Supply(
        name=name,
        description=description,
        size_id=size_id,
        manufacturer_id=manufacturer_id,
        material_id=material_id,
        unit_id=unit_id,
        quantity=quantity,
    )
    db.add(supply)
    db.commit()
    
    if cell_id:
        cell = db.get(Cell, cell_id)
        cell.supply_id = supply.id  # Set FK directly
        db.commit()
        
    return RedirectResponse("/catalogs/supplies/", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/{supply_id}/edit", response_class=HTMLResponse)
async def edit_supply_form(supply_id: int, request: Request, db: Session = Depends(get_db)):
    supply = db.get(Supply, supply_id)
    if not supply:
        raise HTTPException(404, "Supply not found")
    ctx = {
        "request": request,
        "supply": supply,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
    }
    return templates.TemplateResponse("catalogs/supplies/edit.html", ctx)


@router.post("/{supply_id}/edit")
async def edit_supply(
    supply_id: int,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(None),
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    material_id: int = Form(None),
    unit_id: int = Form(None),
    quantity: float = Form(0),
    db: Session = Depends(get_db),
):
    supply = db.get(Supply, supply_id)
    if not supply:
        raise HTTPException(404, "Supply not found")

    supply.name = name
    supply.description = description
    supply.size_id = size_id
    supply.manufacturer_id = manufacturer_id
    supply.material_id = material_id
    supply.unit_id = unit_id
    supply.quantity = quantity
    db.commit()
    
    if cell_id:
        cell = db.get(Cell, cell_id)
        cell.supply_id = supply.id  # Set FK directly
        db.commit()
        
    return RedirectResponse(f"/catalogs/supplies/{supply_id}", status_code=status.HTTP_303_SEE_OTHER)


@router.post("/{supply_id}/delete")
async def delete_supply(supply_id: int, db: Session = Depends(get_db)):
    supply = db.get(Supply, supply_id)
    if supply:
        db.delete(supply)
        db.commit()
    return RedirectResponse("/catalogs/supplies/", status_code=status.HTTP_303_SEE_OTHER)