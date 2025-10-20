from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database.create_db import get_db
from app.models import Receiving, Cell, Manufacturer, Supply, Production, Consumable

router = APIRouter(prefix="/receivings", tags=["receivings"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# Список всех приемок
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def read_receivings(request: Request, db: Session = Depends(get_db)):
    receivings = db.query(Receiving).order_by(Receiving.created_at.desc()).all()
    return templates.TemplateResponse(
        "receivings/list.html",
        {"request": request, "receivings": receivings},
    )


# ----------------------
# Страница создания приемки
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def receiving_create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "supplies": db.query(Supply).order_by(Supply.name).all(),
        "productions": db.query(Production).order_by(Production.name).all(),
        "consumables": db.query(Consumable).order_by(Consumable.name).all(),
        "cells": db.query(Cell).order_by(Cell.name).all(),
        "manufacturers": db.query(Manufacturer).order_by(Manufacturer.name).all(),
    }
    return templates.TemplateResponse("receivings/create.html", ctx)


# ----------------------
# Создание приемки
# ----------------------
@router.post("/create")
async def create_receiving(
    request: Request,
    name: str = Form(""),
    comments: str = Form(""),
    supply_id: int = Form(None),
    production_id: int = Form(None),
    consumable_id: int = Form(None),
    cell_id: int = Form(None),
    manufacturer_id: int = Form(None),
    db: Session = Depends(get_db),
):
    def to_int_or_none(value):
        return int(value) if value else None

    # Выбираем привязанную номенклатуру
    item_id = None
    if supply_id:
        supply = db.get(Supply, supply_id)
        if not supply:
            raise HTTPException(status_code=404, detail="Supply not found")
        item_id = supply.id
    elif production_id:
        production = db.get(Production, production_id)
        if not production:
            raise HTTPException(status_code=404, detail="Production not found")
        item_id = production.id
    elif consumable_id:
        consumable = db.get(Consumable, consumable_id)
        if not consumable:
            raise HTTPException(status_code=404, detail="Consumable not found")
        item_id = consumable.id

    new_receiving = Receiving(
        name=name or f"Приемка от {datetime.now().strftime('%d.%m.%Y %H:%M')}",
        comments=comments,
        item_id=item_id,
        cell_id=to_int_or_none(cell_id),
        manufacturer_id=to_int_or_none(manufacturer_id),
        created_at=datetime.now(),
        status="pending",
    )

    db.add(new_receiving)
    db.commit()
    db.refresh(new_receiving)

    return RedirectResponse(
        url=f"/receivings/{new_receiving.id}",
        status_code=status.HTTP_303_SEE_OTHER,
    )


# ----------------------
# Просмотр конкретной приемки
# ----------------------
@router.get("/{receiving_id}", response_class=HTMLResponse)
async def view_receiving(receiving_id: int, request: Request, db: Session = Depends(get_db)):
    receiving = db.get(Receiving, receiving_id)
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")
    return templates.TemplateResponse(
        "receivings/detail.html",
        {"request": request, "receiving": receiving},
    )


# ----------------------
# Удаление приемки
# ----------------------
@router.get("/delete/{receiving_id}")
async def delete_receiving(receiving_id: int, db: Session = Depends(get_db)):
    receiving = db.get(Receiving, receiving_id)
    if receiving:
        db.delete(receiving)
        db.commit()
    return RedirectResponse(url="/receivings/", status_code=status.HTTP_303_SEE_OTHER)