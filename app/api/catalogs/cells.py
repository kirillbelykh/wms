from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database.create_db import get_db
from app.models import Cell, Item, Barcode

router = APIRouter(prefix="/catalogs/cells", tags=["catalogs:cells"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# List all cells
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Cell).order_by(Cell.name).all()
    return templates.TemplateResponse(
        "catalogs/cells/list.html",
        {"request": request, "rows": rows}
    )


# ----------------------
# Show create form
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "items": db.query(Item).order_by(Item.name).all(),
    }
    return templates.TemplateResponse("catalogs/cells/create.html", ctx)


# ----------------------
# Create cell
# ----------------------
@router.post("/create")
async def create(
    name: str = Form(...),
    capacity: float = Form(0.0),
    item_id: int = Form(None),
    db: Session = Depends(get_db),
):
    cell = Cell(name=name, capacity=capacity)
    db.add(cell)
    db.commit()
    db.refresh(cell)

    # Привязка товара, если выбран
    if item_id:
        item = db.query(Item).filter(Item.id == item_id).first()
        if item:
            cell.item_id = item.id
            db.commit()

    return RedirectResponse(
        f"/catalogs/cells/",
        status_code=status.HTTP_303_SEE_OTHER
    )


# ----------------------
# Detail / Edit cell
# ----------------------
@router.get("/{row_id}/", response_class=HTMLResponse)
async def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Cell).filter(Cell.id == row_id).first()
    if not row:
        raise HTTPException(404, "Cell not found")

    barcode = db.query(Barcode).filter(Barcode.cell_id == row_id).first()
    ctx = {
        "request": request,
        "cell": row,  # передаем в шаблон как 'cell'
        "barcode": barcode,
        "items": db.query(Item).order_by(Item.name).all(),
    }
    # Используем create.html + макрос
    return templates.TemplateResponse("catalogs/cells/create.html", ctx)


# ----------------------
# Update cell
# ----------------------
@router.post("/{row_id}/update")
async def update(
    row_id: int,
    name: str = Form(...),
    capacity: float = Form(0.0),
    item_id: int = Form(None),
    db: Session = Depends(get_db),
):
    row = db.query(Cell).filter(Cell.id == row_id).first()
    if not row:
        raise HTTPException(404, "Cell not found")

    row.name = name
    row.capacity = capacity

    # Привязка к товару (или отвязка)
    if item_id:
        item = db.query(Item).filter(Item.id == item_id).first()
        row.item_id = item.id if item else None
    else:
        row.item_id = None

    db.commit()
    db.refresh(row)

    return RedirectResponse(
        f"/catalogs/cells/{row_id}/",
        status_code=status.HTTP_303_SEE_OTHER
    )


# ----------------------
# Delete cell
# ----------------------
@router.get("/{row_id}/delete")
async def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Cell).filter(Cell.id == row_id).first()
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse(
        "/catalogs/cells/",
        status_code=status.HTTP_303_SEE_OTHER
    )