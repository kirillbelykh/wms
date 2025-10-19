from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from fastapi.responses import HTMLResponse
from app.database import get_db
from app.models import Item, Cell, Batch
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/catalogs/inventory", tags=["Inventory"])
templates = Jinja2Templates(directory="templates")

@router.get("/", response_class=HTMLResponse)
async def inventory_list(request: Request, db: Session = Depends(get_db)):
    items = (
        db.query(Item)
        .outerjoin(Item.cell)
        .outerjoin(Item.batch)
        .all()
    )

    return templates.TemplateResponse(
        "catalogs/inventory/list.html",
        {"request": request, "items": items},
    )