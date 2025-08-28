from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from fastapi.templating import Jinja2Templates

from app.database.create_db import get_db
from app.models import ItemType

router = APIRouter(prefix="/catalogs/item-types", tags=["catalogs:item-types"])
templates = Jinja2Templates(directory="app/templates")


# --------- Список ---------
@router.get("/", response_class=HTMLResponse)
async def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(ItemType).order_by(ItemType.name).all()
    return templates.TemplateResponse(
        "catalogs/item_types/list.html", {"request": request, "rows": rows}
    )


# --------- Создание ---------
@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request):
    return templates.TemplateResponse("catalogs/item_types/create.html", {"request": request})


@router.post("/create")
async def create(
    request: Request,
    name: str = Form(...),
    action: str = Form("save"),
    db: Session = Depends(get_db),
):
    item_type = ItemType(name=name)
    db.add(item_type)
    db.commit()

    if action == "save_close":
        return RedirectResponse("/catalogs/item-types/", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse("/catalogs/item-types/create", status_code=status.HTTP_303_SEE_OTHER)


# --------- Детали ---------
@router.get("/{row_id}/", response_class=HTMLResponse)
async def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(ItemType).get(row_id)
    if not row:
        raise HTTPException(404)
    return templates.TemplateResponse(
        "catalogs/item_types/detail.html", {"request": request, "row": row}
    )


# --------- Обновление ---------
@router.post("/{row_id}/update")
async def update(
    row_id: int,
    name: str = Form(...),
    db: Session = Depends(get_db),
):
    row = db.query(ItemType).get(row_id)
    if not row:
        raise HTTPException(404)
    row.name = name
    db.commit()
    return RedirectResponse(f"/catalogs/item-types/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)


# --------- Удаление ---------
@router.get("/{row_id}/delete")
async def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(ItemType).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/item-types/", status_code=status.HTTP_303_SEE_OTHER)