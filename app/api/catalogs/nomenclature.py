from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Supply, Production, Consumable
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/catalogs", tags=["catalogs"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/overview", response_class=HTMLResponse)
async def nomenclature_overview(request: Request, db: Session = Depends(get_db)):
    supplies = db.query(Supply).all()
    productions = db.query(Production).all()
    consumables = db.query(Consumable).all()
    
    return templates.TemplateResponse(
        "catalogs/nomenclature_overview.html",
        {
            "request": request,
            "supplies": supplies,
            "productions": productions,
            "consumables": consumables
        }
    )