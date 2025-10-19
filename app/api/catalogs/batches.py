from fastapi import APIRouter, Request, Form, Depends, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Batch, Item
from fastapi.templating import Jinja2Templates

router = APIRouter(prefix="/catalogs/batches", tags=["Batches"])
templates = Jinja2Templates(directory="app/templates")


# Список партий
@router.get("/", response_class=HTMLResponse)
async def batches_list(request: Request, db: Session = Depends(get_db)):
    batches = db.query(Batch).all()
    return templates.TemplateResponse(
        "catalogs/batches/list.html",
        {"request": request, "batches": batches},
    )


# Форма создания партии
@router.get("/create", response_class=HTMLResponse)
async def batches_create_form(request: Request, db: Session = Depends(get_db)):
    items = db.query(Item).all()
    return templates.TemplateResponse(
        "catalogs/batches/form.html",
        {"request": request, "items": items},
    )


# Создание партии
@router.post("/create")
async def batches_create(
    request: Request,
    name: str = Form(...),
    quantity: float = Form(...),
    item_id: int = Form(...),
    db: Session = Depends(get_db),
):
    batch = Batch(name=name, quantity=quantity, item_id=item_id)
    db.add(batch)
    db.commit()
    db.refresh(batch)

    return RedirectResponse(
        url="/catalogs/batches/",
        status_code=status.HTTP_303_SEE_OTHER,
    )