from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Batch

router = APIRouter(prefix='/batches', tags=['batches'])

templates = Jinja2Templates(directory='app/templates')

@router.get('/', response_class=HTMLResponse)
async def read_batches(request: Request, db: Session = Depends(get_db)):
    batches = db.query(Batch).all()
    return templates.TemplateResponse('batches.html', {'request': request, 'batches': batches})
    
    
@router.get('/{batch_id}', response_class=HTMLResponse)
async def read_batch(batch_id: int, request: Request, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return templates.TemplateResponse('batches_detail.html', {'request': request, 'batch': batch})

@router.post('/', response_class=HTMLResponse)
async def create_batch(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    new_batch = Batch(
        name=form_data.get('name'),
        description=form_data.get('description'),
        quantity=int(form_data.get('quantity', 0))
    )
    
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)
    
    return templates.TemplateResponse('batches.html', {'request': request, 'batch': new_batch})

@router.delete('/delete/{batch_id}', response_class=HTMLResponse)
async def delete_batch(batch_id: int, request: Request, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    db.delete(batch)
    db.commit()
    
    return templates.TemplateResponse('batches.html', {'request': request, 'message': 'Batch deleted successfully'})    

