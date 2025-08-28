from fastapi import APIRouter, Request, Form, Depends, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from fastapi.templating import Jinja2Templates

from app.database.create_db import get_db
from app.models import Material

templates = Jinja2Templates(directory="app/templates")
router = APIRouter(prefix="/catalogs/materials", tags=["catalogs:materials"])


# --------- Список ---------
@router.get("/", response_class=HTMLResponse)
def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Material).order_by(Material.name).all()
    return templates.TemplateResponse("catalogs/materials/list.html", {"request": request, "rows": rows})


# --------- Создание ---------
@router.get("/create", response_class=HTMLResponse)
def create_page(request: Request):
    return templates.TemplateResponse("catalogs/materials/create.html", {"request": request})


@router.post("/create")
def create(
    name: str = Form(...),
    description: str = Form(""),
    action: str = Form("save"),
    db: Session = Depends(get_db),
):
    material = Material(name=name, description=description)
    db.add(material)
    db.commit()

    if action == "save_close":
        return RedirectResponse("/catalogs/materials/", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse("/catalogs/materials/create", status_code=status.HTTP_303_SEE_OTHER)


# --------- Детали ---------
@router.get("/{row_id}/", response_class=HTMLResponse)
def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Material).get(row_id)
    if not row:
        raise HTTPException(404)
    return templates.TemplateResponse("catalogs/materials/detail.html", {"request": request, "row": row})


# --------- Обновление ---------
@router.post("/{row_id}/update")
def update(
    row_id: int,
    name: str = Form(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
):
    row = db.query(Material).get(row_id)
    if not row:
        raise HTTPException(404)
    row.name = name
    row.description = description
    db.commit()
    return RedirectResponse(f"/catalogs/materials/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)


# --------- Удаление ---------
@router.get("/{row_id}/delete")
def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Material).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/materials/", status_code=status.HTTP_303_SEE_OTHER)