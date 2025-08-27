import random
from io import BytesIO

from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

import barcode
from barcode.writer import ImageWriter

from app.database.create_db import get_db
from app.models import Barcode, Item, Cell

router = APIRouter(prefix="/catalogs/barcodes", tags=["catalogs:barcodes"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------
# Генерация числового ШК
# -----------------------------
def generate_numeric_code(length: int = 12) -> str:
    first = str(random.randint(1, 9))
    rest = "".join(str(random.randint(0, 9)) for _ in range(length - 1))
    return first + rest

# -----------------------------
# Корневая страница раздела ШК
# -----------------------------
@router.get("/", response_class=HTMLResponse, name="barcodes_root")
async def barcodes_root(request: Request):
    return templates.TemplateResponse("catalogs/barcodes/index.html", {"request": request})

# -----------------------------
# Список ШК товаров
# -----------------------------
@router.get("/items", response_class=HTMLResponse, name="list_items_barcodes")
async def list_items_barcodes(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Barcode).filter(Barcode.item_id.isnot(None)).order_by(Barcode.id.desc()).all()
    items = db.query(Item).all()
    return templates.TemplateResponse("catalogs/barcodes/items_list.html", {"request": request, "rows": rows, "items": items})

# -----------------------------
# Список ШК ячеек
# -----------------------------
@router.get("/cells", response_class=HTMLResponse, name="list_cells_barcodes")
async def list_cells_barcodes(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Barcode).filter(Barcode.cell_id.isnot(None)).order_by(Barcode.id.desc()).all()
    cells = db.query(Cell).all()
    return templates.TemplateResponse("catalogs/barcodes/cells_list.html", {"request": request, "rows": rows, "cells": cells})

# -----------------------------
# Генерация ШК для товаров
# -----------------------------
@router.get("/items/create", response_class=HTMLResponse, name="barcodes_items_create_page")
async def items_create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {"request": request, "items": db.query(Item).all(), "cells": db.query(Cell).all()}
    return templates.TemplateResponse("catalogs/barcodes/items_create.html", ctx)

@router.post("/items/generate", name="generate_item_barcodes")
async def generate_item_barcodes(quantity: int = Form(...), item_id: int = Form(...), cell_id: int = Form(None), db: Session = Depends(get_db)):
    for _ in range(quantity):
        code = generate_numeric_code()
        while db.query(Barcode).filter(Barcode.code == code).first():
            code = generate_numeric_code()
        db.add(Barcode(code=code, quantity=1, item_id=item_id, cell_id=cell_id))
    db.commit()
    return RedirectResponse("/catalogs/barcodes/items", status_code=status.HTTP_303_SEE_OTHER)

# -----------------------------
# Генерация ШК для ячеек
# -----------------------------
@router.get("/cells/create", response_class=HTMLResponse, name="cells_create_page")
async def cells_create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {"request": request, "cells": db.query(Cell).all(), "items": db.query(Item).all()}
    return templates.TemplateResponse("catalogs/barcodes/cells_create.html", ctx)

@router.post("/cells/generate", name="generate_cell_barcodes")
async def generate_cell_barcodes(quantity: int = Form(...), cell_id: int = Form(...), item_id: int = Form(None), db: Session = Depends(get_db)):
    for _ in range(quantity):
        code = generate_numeric_code()
        while db.query(Barcode).filter(Barcode.code == code).first():
            code = generate_numeric_code()
        db.add(Barcode(code=code, quantity=1, cell_id=cell_id, item_id=item_id))
    db.commit()
    return RedirectResponse("/catalogs/barcodes/cells", status_code=status.HTTP_303_SEE_OTHER)

# -----------------------------
# Получение изображения ШК (с горизонтальным растягиванием)
# -----------------------------
@router.get("/{barcode_id}/image", name="barcode_image")
async def barcode_image(barcode_id: int, db: Session = Depends(get_db)):
    row = db.query(Barcode).get(barcode_id)
    if not row:
        raise HTTPException(404, "Barcode not found")

    CODE128 = barcode.get_barcode_class("code128")
    writer = ImageWriter()
    buffer = BytesIO()

    # Растяжение по горизонтали
    writer_options = {
        "module_width": 0.9,
        "module_height": 20,
        "quiet_zone": 6.5,
        "font_size": 12,
        "text_distance": 7,
    }

    barcode_obj = CODE128(str(row.code), writer=writer)
    barcode_obj.write(buffer, options=writer_options)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/png")

# -----------------------------
# Удаление ШК
# -----------------------------
@router.get("/{barcode_id}/delete", name="barcodes_delete")
async def delete(barcode_id: int, back: str = "", db: Session = Depends(get_db)):
    row = db.query(Barcode).get(barcode_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse(back or "/catalogs/barcodes/", status_code=status.HTTP_303_SEE_OTHER)