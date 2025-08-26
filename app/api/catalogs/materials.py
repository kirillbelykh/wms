from fastapi import APIRouter, Request, Form, Depends, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Material
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")
router = APIRouter(prefix="/catalogs/materials", tags=["catalogs:materials"])

@router.get("/", response_class=HTMLResponse)
def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Material).all()
    return templates.TemplateResponse("catalogs/materials/list.html", {"request": request, "rows": rows})

@router.get("/create", response_class=HTMLResponse)
def create_page(request: Request):
    return templates.TemplateResponse("catalogs/materials/create.html", {"request": request})

@router.post("/create")
def create(name: str = Form(...), description: str = Form(""), db: Session = Depends(get_db)):
    db.add(Material(name=name, description=description))
    db.commit()
    return RedirectResponse("/catalogs/materials/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/", response_class=HTMLResponse)
def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Material).get(row_id)
    if not row:
        raise HTTPException(404)
    return templates.TemplateResponse("catalogs/materials/detail.html", {"request": request, "row": row})

@router.post("/{row_id}/update")
def update(row_id: int, name: str = Form(...), description: str = Form(""), db: Session = Depends(get_db)):
    row = db.query(Material).get(row_id)
    row.name = name
    row.description = description
    db.commit()
    return RedirectResponse(f"/catalogs/materials/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/delete")
def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Material).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/materials/", status_code=status.HTTP_303_SEE_OTHER)