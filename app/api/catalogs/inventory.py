from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session, joinedload
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from app.database import get_db
from app.models import Supply, Production, Consumable, Cell, Batch

router = APIRouter(prefix="/catalogs/inventory", tags=["catalogs:inventory"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def inventory_list(request: Request, db: Session = Depends(get_db)):
    # Сырьё (Supply) с партиями
    supplies = db.query(Supply).options(
        joinedload(Supply.cells),
        joinedload(Supply.batches)
    ).all()

    # Готовая продукция
    productions = db.query(Production).options(
        joinedload(Production.cells)
    ).all()

    # Расходники
    consumables = db.query(Consumable).options(
        joinedload(Consumable.cells)
    ).all()

    return templates.TemplateResponse(
        "catalogs/inventory/list.html",
        {
            "request": request,
            "supplies": supplies,
            "productions": productions,
            "consumables": consumables,
        },
    )