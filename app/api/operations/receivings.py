from fastapi import APIRouter, Depends, HTTPException, Request, Form, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database.create_db import get_db
from app.models import Receiving, Item, Cell, Manufacturer

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
# Страница создания
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def receiving_create_page(request: Request, db: Session = Depends(get_db)):
    items = db.query(Item).all()
    cells = db.query(Cell).all()
    manufacturers = db.query(Manufacturer).all()

    ctx = {
        "request": request,
        "items": items,
        "cells": cells,
        "manufacturers": manufacturers,
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
    item_id: int = Form(...),
    cell_id: str = Form(None),
    manufacturer_id: str = Form(None),
    db: Session = Depends(get_db),
):
    def to_int_or_none(v):
        return int(v) if v and v.strip() != "" else None

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
    receiving = db.query(Receiving).filter(Receiving.id == receiving_id).first()
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
    receiving = db.query(Receiving).filter(Receiving.id == receiving_id).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")

    db.delete(receiving)
    db.commit()
    return RedirectResponse(url="/receivings/", status_code=status.HTTP_303_SEE_OTHER)