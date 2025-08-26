from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Size

router = APIRouter(prefix="/catalogs/sizes", tags=["catalogs:sizes"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def list_page(request: Request, db: Session = Depends(get_db)):
    rows = db.query(Size).order_by(Size.name).all()
    return templates.TemplateResponse("catalogs/sizes/list.html", {"request": request, "rows": rows})

@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request):
    return templates.TemplateResponse("catalogs/sizes/create.html", {"request": request})

@router.post("/create")
async def create(name: str = Form(...), db: Session = Depends(get_db)):
    db.add(Size(name=name))
    db.commit()
    return RedirectResponse("/catalogs/sizes/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/", response_class=HTMLResponse)
async def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Size).get(row_id)
    if not row: raise HTTPException(404)
    return templates.TemplateResponse("catalogs/sizes/detail.html", {"request": request, "row": row})

@router.post("/{row_id}/update")
async def update(row_id: int, name: str = Form(...), db: Session = Depends(get_db)):
    row = db.query(Size).get(row_id)
    if not row: raise HTTPException(404)
    row.name = name
    db.commit()
    return RedirectResponse(f"/catalogs/sizes/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/delete")
async def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Size).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/sizes/", status_code=status.HTTP_303_SEE_OTHER)