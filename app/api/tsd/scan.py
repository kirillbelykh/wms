# app/api/scanner/scan.py
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session, joinedload

from app.database.create_db import get_db
from app.models import Barcode, Cell, Batch, Size, Manufacturer, Material, Supply, Production, Consumable

router = APIRouter(prefix="/scan", tags=["scanner"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# Страница сканера
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def scanner_page(request: Request):
    """
    Страница сканера штрихкодов
    """
    return templates.TemplateResponse("scan/scanner.html", {"request": request})


# ----------------------
# Проверка штрихкода
# ----------------------
@router.post("/check-barcode")
async def check_barcode(barcode_request: dict, db: Session = Depends(get_db)):
    barcode_value = barcode_request.get("barcode", "").strip()
    if not barcode_value:
        return JSONResponse({"error": "Пустой штрихкод"}, status_code=400)

    barcode_obj = db.query(Barcode).filter(Barcode.code == barcode_value).first()
    if not barcode_obj:
        return JSONResponse({"error": "Штрихкод не найден"}, status_code=404)

    # Определяем тип и получаем объект
    item = None
    item_type = "Неизвестно"
    if barcode_obj.supply_id:
        item = db.query(Supply).filter(Supply.id == barcode_obj.supply_id).first()
        item_type = "Поставка"
    elif barcode_obj.production_id:
        item = db.query(Production).filter(Production.id == barcode_obj.production_id).first()
        item_type = "Продукция"
    elif barcode_obj.consumable_id:
        item = db.query(Consumable).filter(Consumable.id == barcode_obj.consumable_id).first()
        item_type = "Расходник"

    if not item:
        return JSONResponse({"error": "Товар не найден"}, status_code=404)

    # Первая связанная ячейка
    cell_name = "-"
    if hasattr(item, "cells") and item.cells:
        cell_name = item.cells[0].name

    # Для Supply выводим первую партию
    batch_display = "-"
    quantity = getattr(item, "quantity", 0)
    if isinstance(item, Supply):
        first_batch = db.query(Batch).filter(Batch.production_id == item.id).first()
        if first_batch:
            batch_display = first_batch.name
            quantity = first_batch.quantity or 0

    response_data = {
        "name": item.name or "-",
        "description": item.description or "-",
        "type": item_type,
        "cell": cell_name,
        "size": item.size.name if getattr(item, "size", None) else "-",
        "material": item.material.name if getattr(item, "material", None) else "-",
        "manufacturer": item.manufacturer.name if getattr(item, "manufacturer", None) else "-",
        "quantity": quantity,
        "batch": batch_display,
        "barcode": barcode_value,
        "success": True,
    }

    return JSONResponse(response_data)


# ----------------------
# WebSocket для live-сканера
# ----------------------
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket для живого сканирования штрихкодов
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[WebSocket] Получено: {data}")
    except WebSocketDisconnect:
        print("[WebSocket] Клиент отключился")