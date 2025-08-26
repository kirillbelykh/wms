import random
from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Barcode, Item, Cell

router = APIRouter(prefix="/catalogs/barcodes", tags=["catalogs:barcodes"])
templates = Jinja2Templates(directory="app/templates")

def generate_numeric_code(length: int = 12) -> str:
    """Генерация числового кода с ненулевой первой цифрой"""
    first = str(random.randint(1, 9))
    rest = "".join(str(random.randint(0, 9)) for _ in range(length - 1))
    return first + rest

# -----------------------
# LIST
# -----------------------
@router.get("/", response_class=HTMLResponse)
async def list_page(request: Request, q: str = "", db: Session = Depends(get_db)):
    qry = db.query(Barcode)
    if q:
        qry = qry.filter(Barcode.code.like(f"%{q}%"))
    rows = qry.order_by(Barcode.id.desc()).all()
    return templates.TemplateResponse(
        "catalogs/barcodes/list.html",
        {"request": request, "rows": rows, "q": q}
    )

# -----------------------
# CREATE PAGE
# -----------------------
@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse(
        "catalogs/barcodes/create.html",
        {
            "request": request,
            "items": db.query(Item).all(),
            "cells": db.query(Cell).all(),
        }
    )

# -----------------------
# GENERATE BARCODES
# -----------------------
@router.post("/generate", name="generate_barcodes")
async def generate(
    quantity: int = Form(...),
    item_id: int = Form(None),
    cell_id: int = Form(None),
    db: Session = Depends(get_db),
):
    for _ in range(max(1, quantity)):
        code = generate_numeric_code()
        while db.query(Barcode).filter(Barcode.code == code).first():
            code = generate_numeric_code()

        row = Barcode(code=code, quantity=1, item_id=item_id, cell_id=cell_id)
        db.add(row)
    db.commit()
    return RedirectResponse("/catalogs/barcodes/", status_code=status.HTTP_303_SEE_OTHER)

# -----------------------
# GENERATE AND ATTACH TO ITEM
# -----------------------
@router.post("/generate-and-attach", name="generate_and_attach")
async def generate_and_attach_to_item(
    item_id: int = Form(...),
    quantity: int = Form(1),
    back: str = Form(None),
    db: Session = Depends(get_db),
):
    code = generate_numeric_code()
    while db.query(Barcode).filter(Barcode.code == code).first():
        code = generate_numeric_code()

    row = Barcode(code=code, quantity=quantity, item_id=item_id)
    db.add(row)
    db.commit()
    return RedirectResponse(back or f"/catalogs/items/{item_id}/", status_code=status.HTTP_303_SEE_OTHER)

# -----------------------
# DELETE
# -----------------------
@router.get("/{row_id}/delete", name="delete_barcode")
async def delete(row_id: int, back: str = "", db: Session = Depends(get_db)):
    row = db.query(Barcode).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse(back or "/catalogs/barcodes/", status_code=status.HTTP_303_SEE_OTHER)