from tokenize import String
from fastapi import APIRouter, Depends, Request, Form, status, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Batch, Item
from sqlalchemy import cast, String, or_

router = APIRouter(prefix="/catalogs/batches", tags=["catalogs:batches"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
def list_page(request: Request, q: str = "", db: Session = Depends(get_db)):
    query = db.query(Batch)

    if q:
        query = query.filter(
            or_(
                cast(Batch.name, String).ilike(f"%{q}%"),   # <-- исправлено
                Batch.description.ilike(f"%{q}%"),
                cast(Batch.quantity, String).ilike(f"%{q}%")
            )
        )

    rows = query.order_by(Batch.name).all()
    return templates.TemplateResponse("catalogs/batches/list.html", {"request": request, "rows": rows, "q": q})

@router.get("/create", response_class=HTMLResponse)
async def create_page(request: Request, db: Session = Depends(get_db)):
    return templates.TemplateResponse("catalogs/batches/create.html", {"request": request, "items": db.query(Item).all()})

@router.post("/create")
async def create(
    name: int = Form(...),
    quantity: float = Form(0.0),
    description: str = Form(""),
    action: str = Form(""),
    db: Session = Depends(get_db),
):
    row = Batch(name=name, quantity=quantity, description=description, cell_id=None)
    db.add(row)
    db.commit()
    
    if action == "save_close":
        return RedirectResponse("/catalogs/batches", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse("/catalogs/batches/create", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/", response_class=HTMLResponse)
async def detail(row_id: int, request: Request, db: Session = Depends(get_db)):
    row = db.query(Batch).get(row_id)
    if not row: raise HTTPException(404)
    return templates.TemplateResponse("catalogs/batches/detail.html", {"request": request, "row": row})

@router.post("/{row_id}/update")
async def update(row_id: int, name: int = Form(...), quantity: float = Form(0.0), description: str = Form(""), db: Session = Depends(get_db)):
    row = db.query(Batch).get(row_id)
    if not row: raise HTTPException(404)
    row.name = name
    row.quantity = quantity
    row.description = description
    db.commit()
    return RedirectResponse(f"/catalogs/batches/{row_id}/", status_code=status.HTTP_303_SEE_OTHER)

@router.get("/{row_id}/delete")
async def delete(row_id: int, db: Session = Depends(get_db)):
    row = db.query(Batch).get(row_id)
    if row:
        db.delete(row)
        db.commit()
    return RedirectResponse("/catalogs/batches/", status_code=status.HTTP_303_SEE_OTHER)