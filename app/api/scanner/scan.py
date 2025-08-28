# app/api/scanner/scan.py
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session, joinedload
from app.database.create_db import get_db
from app.models import Item, Barcode, Cell, Batch, Size, Manufacturer, Material, ItemType

router = APIRouter(prefix="/scan", tags=["scanner"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def scanner_page(request: Request):
    """
    Страница сканера штрихкодов
    """
    return templates.TemplateResponse("scan/scanner.html", {"request": request})


@router.post("/check-barcode")
async def check_barcode(barcode_request: dict, db: Session = Depends(get_db)):
    try:
        barcode_value = barcode_request.get("barcode", "").strip()
        if not barcode_value:
            return JSONResponse({"error": "Пустой штрихкод"}, status_code=400)

        barcode_obj = (
            db.query(Barcode)
            .options(
                joinedload(Barcode.item)
                .joinedload(Item.cell),
                joinedload(Barcode.item)
                .joinedload(Item.batches),
                joinedload(Barcode.item)
                .joinedload(Item.sizes),
                joinedload(Barcode.item)
                .joinedload(Item.manufacturer),
                joinedload(Barcode.item)
                .joinedload(Item.item_types),
                joinedload(Barcode.item)
                .joinedload(Item.material)
            )
            .filter(Barcode.code == barcode_value)
            .first()
        )

        if not barcode_obj or not barcode_obj.item:
            return JSONResponse({"error": "Товар не найден"}, status_code=404)

        item = barcode_obj.item

        # Размер
        size_name = "-"
        if item.sizes:
            if isinstance(item.sizes, (list, tuple)):
                size_name = item.sizes[0].name if len(item.sizes) > 0 else "-"
            else:
                size_name = item.sizes.name

        # Партия
        batch_display = "-"
        quantity = 0
        if item.batches:
            if isinstance(item.batches, (list, tuple)):
                first_batch = item.batches[0] if len(item.batches) > 0 else None
            else:
                first_batch = item.batches
            if first_batch:
                batch_display = str(first_batch.name)
                quantity = first_batch.quantity or 0

        response_data = {
            "name": item.name or "-",
            "size": size_name,
            "cell": item.cell.name if item.cell else "-",
            "quantity": quantity,
            "batch": batch_display,
            "manufacturer": item.manufacturer.name if item.manufacturer else "-",
            "item_type": item.item_types.name if item.item_types else "-",
            "material": item.material.name if item.material else "-",
            "barcode": barcode_value,
            "success": True
        }

        return JSONResponse(response_data)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": f"Ошибка сервера: {str(e)}"}, status_code=500)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """
    WebSocket для live scan.
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[WebSocket] Получено: {data}")
    except WebSocketDisconnect:
        print("[WebSocket] Клиент отключился")