from fastapi import APIRouter, Request, Form, Depends, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Unit
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="app/templates")
router = APIRouter(prefix="/catalogs/units", tags=["catalogs:units"])

@router.get("/", response_class=HTMLResponse)
def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Unit).all()
    return templates.TemplateResponse("catalogs/units/list.html", {"request": request, "rows": rows})

@router.get("/create", response_class=HTMLResponse)
def create_page(request: Request):
    return templates.TemplateResponse("catalogs/units/create.html", {"request": request})

@router.post("/create")
def create(name: str = Form(...), 
           description: str = Form(""), 
           action: str = Form(""),
           db: Session = Depends(get_db)):
    db.add(Unit(name=name, description=description))
    db.commit()
    
    if action == "save_close":
        return RedirectResponse("/catalogs/units", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse("/catalogs/units/create", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/", response_class=HTMLResponse)
def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Unit).get(row_id)
    if not row:
        raise HTTPException(404)
    return templates.TemplateResponse("catalogs/units/detail.html", {"request": request, "row": row})

@router.post("/{row_id}/update")
def update(row_id: int, name: str = Form(...), description: str = Form(""), db: Session = Depends(get_db)):
    row = db.query(Unit).get(row_id)
    row.name = name
    row.description = description
    db.commit()
    return RedirectResponse(f"/catalogs/units/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/delete")
def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Unit).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/units/", status_code=status.HTTP_303_SEE_OTHER)