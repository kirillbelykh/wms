from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from fastapi.responses import HTMLResponse
from app.database import get_db
from app.models import Item, Cell, Batch
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/catalogs/inventory", tags=["catalogs:inventory"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def inventory_list(request: Request, db: Session = Depends(get_db)):
    items = (
        db.query(Item)
        .options(
            joinedload(Item.cells),
            joinedload(Item.batch)
        )
        .all()
    )

    return templates.TemplateResponse(
        "catalogs/inventory/list.html",
        {"request": request, "items": items},
    )