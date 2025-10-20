from fastapi import APIRouter, HTTPException, Request, Form, Depends, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from fastapi.templating import Jinja2Templates

from app.database import get_db
from app.models import Batch, Production

router = APIRouter(prefix="/catalogs/batches", tags=["Batches"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------
# List all batches
# ----------------------
@router.get("/", response_class=HTMLResponse)
async def batches_list(request: Request, db: Session = Depends(get_db)):
    batches = db.query(Batch).all()
    return templates.TemplateResponse(
        "catalogs/batches/list.html",
        {"request": request, "batches": batches},
    )


# ----------------------
# Show create batch form
# ----------------------
@router.get("/create", response_class=HTMLResponse)
async def batches_create_form(request: Request, db: Session = Depends(get_db)):
    productions = db.query(Production).order_by(Production.name).all()
    return templates.TemplateResponse(
        "catalogs/batches/form.html",
        {"request": request, "productions": productions},
    )


# ----------------------
# Create batch
# ----------------------
@router.post("/create")
async def batches_create(
    name: str = Form(...),
    quantity: float = Form(...),
    production_id: int = Form(...),
    db: Session = Depends(get_db),
):
    production = db.get(Production, production_id)
    if not production:
        raise HTTPException(status_code=404, detail="Production not found")

    batch = Batch(name=name, quantity=quantity, production_id=production.id)
    db.add(batch)
    db.commit()
    db.refresh(batch)

    return RedirectResponse(
        url="/catalogs/batches/",
        status_code=status.HTTP_303_SEE_OTHER,
    )


# ----------------------
# Delete batch
# ----------------------
@router.get("/{batch_id}/delete")
async def batches_delete(batch_id: int, db: Session = Depends(get_db)):
    batch = db.get(Batch, batch_id)
    if batch:
        db.delete(batch)
        db.commit()
    return RedirectResponse(url="/catalogs/batches/", status_code=status.HTTP_303_SEE_OTHER)