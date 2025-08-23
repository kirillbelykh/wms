from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Batch, Cell, Item
from starlette import status
from fastapi.templating import Jinja2Templates
from app.schemas import batches as schemas

router = APIRouter(prefix="/batches", tags=["batches"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def read_batches(request: Request, db: Session = Depends(get_db)):
    batches = db.query(Batch).all()
    cells = db.query(Cell).all()
    items = db.query(Item).all()

    return templates.TemplateResponse(
        "batches.html",
        {"request": request, "batches": batches, "cells": cells, "items": items},
    )


@router.post("/", response_class=HTMLResponse)
async def create_batch(
    request: Request,
    name: str = Form(...),
    description: str = Form(""),
    quantity: int = Form(...),
    cell_id: int = Form(...),
    item_id: int = Form(...),
    db: Session = Depends(get_db),
):
    # Валидируем через Pydantic
    batch_in = schemas.BatchCreate(
        name=name,
        description=description,
        quantity=quantity,
        cell_id=cell_id,
        item_id=item_id,
    )

    new_batch = Batch(**batch_in.dict())
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)

    return RedirectResponse(url="/batches/", status_code=status.HTTP_303_SEE_OTHER)


@router.get("/delete/{batch_id}", response_class=HTMLResponse)
async def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    db.delete(batch)
    db.commit()

    return RedirectResponse(url="/batches/", status_code=status.HTTP_303_SEE_OTHER)