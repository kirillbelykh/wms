from fastapi import APIRouter, HTTPException, Request, Form, Depends, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from fastapi.templating import Jinja2Templates

from app.database import get_db
from app.models import Batch, Supply

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
    supplies = db.query(Supply).order_by(Supply.name).all()
    return templates.TemplateResponse(
        "catalogs/batches/form.html",
        {"request": request, "supplies": supplies},
    )


# ----------------------
# Create batch
# ----------------------
@router.post("/create")
async def batches_create(
    request: Request,
    name: str = Form(...),
    quantity: float = Form(...),
    supply_id: int = Form(...),
    db: Session = Depends(get_db),
):
    # Привязка партии только к Supply
    supply = db.query(Supply).filter(Supply.id == supply_id).first()
    if not supply:
        raise HTTPException(status_code=404, detail="Supply not found")

    batch = Batch(name=name, quantity=quantity, supply_id=supply_id)
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
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if batch:
        db.delete(batch)
        db.commit()
    return RedirectResponse(url="/catalogs/batches/", status_code=status.HTTP_303_SEE_OTHER)