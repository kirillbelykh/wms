# app/api/scanner/scan.py
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session, joinedload
from app.database.create_db import get_db
from app.models import Item, Barcode, Cell, Batch, Size
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/scan", tags=["scanner"])
templates = Jinja2Templates(directory="app/templates")

class BarcodeRequest(BaseModel):
    barcode: str

@router.get("/", response_class=HTMLResponse)
async def scanner_page(request: Request):
    return templates.TemplateResponse("scan/scanner.html", {"request": request})

# app/api/scanner/scan.py
@router.post("/check-barcode")
async def check_barcode(request: BarcodeRequest, db: Session = Depends(get_db)):
    try:
        barcode_value = request.barcode.strip()
        
        if not barcode_value:
            return JSONResponse(
                content={"error": "Пустой штрихкод"},
                status_code=400
            )
        
        print(f"Получен штрихкод: {barcode_value}")
        
        # Ищем товар по штрихкоду с предзагрузкой связанных данных
        barcode = (db.query(Barcode)
                 .options(
                     joinedload(Barcode.item)
                     .joinedload(Item.cell),
                     joinedload(Barcode.item)
                     .joinedload(Item.batches),
                     joinedload(Barcode.item)
                     .joinedload(Item.sizes)  # Предзагрузка размеров
                 )
                 .filter(Barcode.code == barcode_value)
                 .first())
        
        if not barcode or not barcode.item:
            print(f"Штрихкод {barcode_value} не найден в базе")
            return JSONResponse(
                content={"error": "Товар не найден"},
                status_code=404
            )

        item = barcode.item
        
        # Получаем размеры - исправленная обработка
        sizes = []
        if item.sizes:
            # Если sizes - это список объектов Size
            sizes = [size.name for size in item.sizes]
            size_display = ", ".join(sizes) if sizes else "-"
        else:
            size_display = "-"
        
        # Получаем партии - исправленная обработка
        batches = []
        if item.batches:
            batches = [batch.number for batch in item.batches if batch.number]
            batch_display = ", ".join(batches) if batches else "-"
            # Общее количество из всех партий
            quantity = sum(batch.quantity for batch in item.batches if batch.quantity)
        else:
            batch_display = "-"
            quantity = 0

        response_data = {
            "name": item.name or "-",
            "size": size_display,
            "cell": item.cell.name if item.cell else "-",
            "quantity": quantity,
            "batch": batch_display,
            "barcode": barcode_value,
            "success": True
        }
        
        print(f"Найден товар: {item.name}")
        return JSONResponse(content=response_data)
        
    except Exception as e:
        print(f"Ошибка при обработке штрихкода: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            content={"error": f"Ошибка сервера: {str(e)}"},
            status_code=500
        )

# WebSocket endpoint (опционально, можно оставить для других целей)
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Обработка WebSocket сообщений
            print(f"WebSocket данные: {data}")
    except WebSocketDisconnect:
        print("Клиент отключился")