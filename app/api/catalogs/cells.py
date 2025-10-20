from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session, joinedload

from app.database.create_db import get_db
from app.models import Cell, Supply, Production, Consumable, Barcode

router = APIRouter(prefix="/catalogs/cells", tags=["catalogs:cells"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# List all cells
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def list_cells(request: Request, db: Session = Depends(get_db)):
    rows = (
        db.query(Cell)
        .options(
            joinedload(Cell.supply),
            joinedload(Cell.productions),
            joinedload(Cell.consumables),
        )
        .order_by(Cell.name)
        .all()
    )
    return HTMLResponse(
        content=templates.TemplateResponse(
            "catalogs/cells/list.html",
            {"request": request, "rows": rows},
        ).body.decode()
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
    cell = Cell(
        name=name,
        capacity=capacity,
        supply_id=supply_id,
        production_id=production_id,
        consumable_id=consumable_id,
    )
    db.add(cell)
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
    cell.supply_id = supply_id
    cell.production_id = production_id
    cell.consumable_id = consumable_id

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