from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Supply, Size, Cell, Manufacturer, Material, Unit, Batch

router = APIRouter(
    prefix="/catalogs/supplies",
    tags=["catalogs", "supplies"],
)

templates = Jinja2Templates(directory="app/templates")

# -------- List Supplies --------
@router.get("/", response_class=HTMLResponse)
async def list_supplies(request: Request, db: Session = Depends(get_db)):
    supplies = db.query(Supply).all()
    return templates.TemplateResponse("catalogs/supplies/list.html", {"request": request, "supplies": supplies})

# -------- Create Supply --------
@router.get("/create", response_class=HTMLResponse)
async def create_supply_form(request: Request, db: Session = Depends(get_db)):
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
    return templates.TemplateResponse("catalogs/supplies/create.html", ctx)

@router.post("/create", response_class=HTMLResponse)
async def create_supply(
    request: Request,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(...),
    cell_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    batch_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    new_supply = Supply(
        name=name,
        size_id=size_id,
        cell_id=cell_id,
        description=description,
        manufacturer_id=manufacturer_id,
        material_id=material_id,
        unit_id=unit_id,
        batch_id=batch_id,
        quantity=quantity,
    )
    db.add(new_supply)
    db.commit()
    db.refresh(new_supply)
    
    if cell_id:
        cell = db.query(Cell).filter(Cell.id == cell_id).first()
        if cell:
            cell.items = new_supply
            db.commit()
            
    if batch_id:
        batch = db.query(Batch).filter(Batch.id == batch_id).first()
        if batch:
            batch.item = new_supply
            db.commit()
            
    return RedirectResponse(url="/catalogs/supplies/", status_code=status.HTTP_303_SEE_OTHER)

    
# -------- View Supply Details --------
@router.get("/{supply_id}", response_class=HTMLResponse)
async def view_supply(request: Request, supply_id: int, db: Session = Depends(get_db)):
    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")
    return templates.TemplateResponse("catalogs/supplies/detail.html", {"request": request, "supply": supply})


# -------- Edit Supply --------
@router.get("/{supply_id}/edit", response_class=HTMLResponse)
async def edit_supply_form(request: Request, supply_id: int, db: Session = Depends(get_db)):
    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")
    ctx = {
        "request": request,
        "supply": supply,
        "sizes": db.query(Size).all(),
        "cells": db.query(Cell).all(),
        "manufacturers": db.query(Manufacturer).all(),
        "materials": db.query(Material).all(),
        "units": db.query(Unit).all(),
        "batches": db.query(Batch).all(),
    }
    return templates.TemplateResponse("catalogs/supplies/edit.html", ctx)

@router.post("/{supply_id}/edit", response_class=HTMLResponse)
async def edit_supply(
    request: Request,
    supply_id: int,
    name: str = Form(...),
    description: str = Form(...),
    size_id: int = Form(...),
    cell_id: int = Form(...),
    manufacturer_id: int = Form(...),
    material_id: int = Form(...),
    unit_id: int = Form(...),
    batch_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")
    
    supply.name = name
    supply.description = description
    supply.size_id = size_id
    supply.cell_id = cell_id
    supply.manufacturer_id = manufacturer_id
    supply.material_id = material_id
    supply.unit_id = unit_id
    supply.batch_id = batch_id
    supply.quantity = quantity
    
    db.commit()
    
    return RedirectResponse(url=f"/catalogs/supplies/{supply_id}", status_code=status.HTTP_303_SEE_OTHER)

# -------- Delete Supply --------
@router.post("/{supply_id}/delete", response_class=HTMLResponse)
async def delete_supply(request: Request, supply_id: int, db: Session = Depends(get_db)):
    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")
    
    db.delete(supply)
    db.commit()
    
    return RedirectResponse(url="/catalogs/supplies/", status_code=status.HTTP_303_SEE_OTHER)
