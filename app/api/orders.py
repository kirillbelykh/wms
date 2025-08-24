from fastapi import APIRouter, Depends, HTTPException, Request, status, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
from app.database.create_db import get_db
from app.models import Order
from app.schemas.orders import OrderCreate, OrderUpdate

router = APIRouter(prefix="/orders", tags=["orders"])
templates = Jinja2Templates(directory="app/templates")

# -------------------
# READ all orders
# -------------------
@router.get("/", response_class=HTMLResponse)
async def read_orders(request: Request, db: Session = Depends(get_db)):
    orders = db.query(Order).all()
    return templates.TemplateResponse(
        "orders.html",
        {"request": request, "orders": orders}
    )

# -------------------
# CREATE order
# -------------------
@router.post("/create", response_class=HTMLResponse)
async def create_order(
    request: Request,
    name: str = Form(...),
    type: str = Form(...),
    description: str = Form(""),
    quantity: int = Form(...),
    db: Session = Depends(get_db),
):
    if type not in {"receiving", "shipping", "movement"}:
        return templates.TemplateResponse(
            "orders.html",
            {"request": request, "orders": db.query(Order).all(), "error": "Неверный тип заказа"}
        )

    new_order = Order(
        name=name,
        type=type,
        description=description,
        quantity=quantity,
        status="pending",
        created_at=datetime.now()
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    return RedirectResponse(url="/orders/", status_code=status.HTTP_303_SEE_OTHER)

# -------------------
# READ single order
# -------------------
@router.get("/{order_id}", response_class=HTMLResponse)
async def read_order(order_id: int, request: Request, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return templates.TemplateResponse("order_detail.html", {"request": request, "order": order})

# -------------------
# UPDATE order
# -------------------
@router.post("/update/{order_id}", response_class=HTMLResponse)
async def update_order(
    order_id: int,
    request: Request,
    name: str = Form(None),
    type: str = Form(None),
    description: str = Form(None),
    quantity: int = Form(None),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if type and type not in {"receiving", "shipping", "movement"}:
        return templates.TemplateResponse(
            "orders.html",
            {"request": request, "orders": db.query(Order).all(), "error": "Неверный тип заказа"}
        )

    if name:
        order.name = name
    if type:
        order.type = type
    if description is not None:
        order.description = description
    if quantity is not None:
        order.quantity = quantity

    db.commit()
    db.refresh(order)
    return RedirectResponse(url="/orders/", status_code=status.HTTP_303_SEE_OTHER)

# -------------------
# DELETE order
# -------------------
@router.get("/delete/{order_id}", response_class=HTMLResponse)
async def delete_order(order_id: int, request: Request, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    db.delete(order)
    db.commit()
    return RedirectResponse(url="/orders/", status_code=status.HTTP_303_SEE_OTHER)