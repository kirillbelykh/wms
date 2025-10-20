from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Production, Size, Cell, Manufacturer, Material, Unit, Batch

router = APIRouter(prefix="/catalogs/productions", tags=["catalogs", "productions"])
templates = Jinja2Templates(directory="app/templates")


# List Productions
@router.get("/", response_class=HTMLResponse)
async def list_productions(request: Request, db: Session = Depends(get_db)):
    productions = db.query(Production).order_by(Production.name).all()
    cells = db.query(Cell).all()
    return templates.TemplateResponse("catalogs/productions/list.html", {
        "request": request,
        "productions": productions,
        "cells": cells,
    })


# Create Production Form
@router.get("/create", response_class=HTMLResponse)
async def create_production_form(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "batches": db.query(Batch).all(),
        "quantity": 0,
    }
    return templates.TemplateResponse("catalogs/productions/create.html", ctx)


# Create Production
@router.post("/create")
async def create_production(
    request: Request,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(...),
    cell_id: int = Form(...),
    batch_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    production = Production(
        name=name,
        description=description,
        size_id=size_id,
        manufacturer_id=manufacturer_id,
        material_id=material_id,
        unit_id=unit_id,
        quantity=quantity,
    )
    db.add(production)
    db.commit()
    db.refresh(production)

    if cell_id:
        cell = db.query(Cell).filter(Cell.id == cell_id).first()
        if cell:
            cell.productions = production
            db.commit()
            
    if batch_id:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if batch:
            batch.production = production
            db.commit()
        
    return RedirectResponse("/catalogs/productions/", status_code=status.HTTP_303_SEE_OTHER)


# Edit Production
@router.get("/{production_id}/edit", response_class=HTMLResponse)
async def edit_production_form(request: Request, production_id: int, db: Session = Depends(get_db)):
    production = db.query(Production).filter(Production.id == production_id).first()
    if not production:
        raise HTTPException(404, "Production not found")
    ctx = {
        "request": request,
        "production": production,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
    }
    return templates.TemplateResponse("catalogs/productions/edit.html", ctx)


@router.post("/{production_id}/edit", response_class=HTMLResponse)
async def edit_production(
    request: Request,
    production_id: int,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(...),
    batch_id: int = Form(None),
    cell_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    production = db.query(Production).filter(Production.id == production_id).first()
    if not production:
        raise HTTPException(404, "Production not found")

    production.name = name
    production.description = description
    production.size_id = size_id
    production.manufacturer_id = manufacturer_id
    production.material_id = material_id
    production.unit_id = unit_id
    production.quantity = quantity

    db.commit()
    
    if cell_id:
        cell = db.query(Cell).filter(Cell.id == cell_id).first()
        cell.productions = production
        db.commit()
            
    if batch_id:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if batch:
            batch.production = production
            db.commit()
            
    return RedirectResponse(f"/catalogs/productions/{production_id}", status_code=status.HTTP_303_SEE_OTHER)


# Delete Production
@router.post("/{production_id}/delete", response_class=HTMLResponse)
async def delete_production(production_id: int, db: Session = Depends(get_db)):
    production = db.query(Production).filter(Production.id == production_id).first()
    if not production:
        raise HTTPException(404, "Production not found")
    db.delete(production)
    db.commit()
    return RedirectResponse("/catalogs/productions/", status_code=status.HTTP_303_SEE_OTHER)