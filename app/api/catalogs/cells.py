from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database.create_db import get_db
from app.models import Cell, Supply, Production, Consumable, Barcode

router = APIRouter(prefix="/catalogs/cells", tags=["catalogs:cells"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# List all cells
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def list_cells(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Cell).order_by(Cell.name).all()
    return templates.TemplateResponse(
        "catalogs/cells/list.html",
        {"request": request, "rows": rows}
    )


# ----------------------
# Show create form
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def create_cell_form(request: Request, db: Session = Depends(get_db)):
    ctx = {
        "request": request,
        "supplies": db.query(Supply).order_by(Supply.name).all(),
        "productions": db.query(Production).order_by(Production.name).all(),
        "consumables": db.query(Consumable).order_by(Consumable.name).all(),
    }
    return templates.TemplateResponse("catalogs/cells/create.html", ctx)


# ----------------------
# Create cell
# ----------------------
@router.post("/create")
async def create_cell(
    name: str = Form(...),
    capacity: float = Form(0.0),
    supply_id: int = Form(None),
    production_id: int = Form(None),
    consumable_id: int = Form(None),
    db: Session = Depends(get_db),
):
    cell = Cell(name=name, capacity=capacity)
    db.add(cell)
    db.commit()
    db.refresh(cell)

    # Привязка к номенклатуре
    if supply_id:
        supply = db.query(Supply).filter(Supply.id == supply_id).first()
        if supply:
            cell.item_id = supply.id
    elif production_id:
        production = db.query(Production).filter(Production.id == production_id).first()
        if production:
            cell.item_id = production.id
    elif consumable_id:
        consumable = db.query(Consumable).filter(Consumable.id == consumable_id).first()
        if consumable:
            cell.item_id = consumable.id

    db.commit()
    return RedirectResponse("/catalogs/cells/", status_code=status.HTTP_303_SEE_OTHER)


# ----------------------
# Detail / Edit cell
# ----------------------
@router.get("/{cell_id}/", response_class=HTMLResponse)
async def detail_cell(cell_id: int, request: Request, db: Session = Depends(get_db)):
    cell = db.query(Cell).filter(Cell.id == cell_id).first()
    if not cell:
        raise HTTPException(404, "Cell not found")

    barcode = db.query(Barcode).filter(Barcode.cell_id == cell_id).first()
    ctx = {
        "request": request,
        "cell": cell,
        "barcode": barcode,
        "supplies": db.query(Supply).order_by(Supply.name).all(),
        "productions": db.query(Production).order_by(Production.name).all(),
        "consumables": db.query(Consumable).order_by(Consumable.name).all(),
    }
    return templates.TemplateResponse("catalogs/cells/create.html", ctx)


# ----------------------
# Update cell
# ----------------------
@router.post("/{cell_id}/update")
async def update_cell(
    cell_id: int,
    name: str = Form(...),
    capacity: float = Form(0.0),
    supply_id: int = Form(None),
    production_id: int = Form(None),
    consumable_id: int = Form(None),
    db: Session = Depends(get_db),
):
    cell = db.query(Cell).filter(Cell.id == cell_id).first()
    if not cell:
        raise HTTPException(404, "Cell not found")

    cell.name = name
    cell.capacity = capacity

    # Обновляем привязку
    if supply_id:
        cell.item_id = supply_id
    elif production_id:
        cell.item_id = production_id
    elif consumable_id:
        cell.item_id = consumable_id
    else:
        cell.item_id = None

    db.commit()
    return RedirectResponse(f"/catalogs/cells/{cell_id}/", status_code=status.HTTP_303_SEE_OTHER)


# ----------------------
# Delete cell
# ----------------------
@router.get("/{cell_id}/delete")
async def delete_cell(cell_id: int, db: Session = Depends(get_db)):
    cell = db.query(Cell).filter(Cell.id == cell_id).first()
    if cell:
        db.delete(cell)
        db.commit()
    return RedirectResponse("/catalogs/cells/", status_code=status.HTTP_303_SEE_OTHER)