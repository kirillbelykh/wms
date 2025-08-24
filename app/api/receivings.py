from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Receiving, Order, Item
from datetime import datetime
from app.schemas.receivings import ReceivingCreate

router = APIRouter(prefix='/receivings', tags=['receivings'])
templates = Jinja2Templates(directory='app/templates')

@router.get('/', response_class=HTMLResponse)
async def read_receivings(request: Request, db: Session = Depends(get_db)):
    """
    Retrieve a list of receivings and render them in an HTML template.
    """
    receivings = db.query(Receiving).all()
    items = db.query(Item).all()
    orders = db.query(Order).all()
    return templates.TemplateResponse('receivings.html', 
                                      {'request': request, 'receivings': receivings, 
                                       'items': items, 'orders': orders})

@router.post('/create', response_class=JSONResponse)
async def create_receiving(
    receiving: ReceivingCreate = Depends(),
    db: Session = Depends(get_db)
):
    new_receiving = Receiving(
        name=receiving.name,
        quantity=receiving.quantity,
        status="pending",
        created_at=datetime.now(),
        order_id=receiving.order_id,
        item_id=receiving.item_id,
        country=receiving.country,
        type=receiving.type_,
        unit_of_measure=receiving.unit_of_measure,
        comments=receiving.comments
    )
    
    db.add(new_receiving)
    db.commit()
    db.refresh(new_receiving)

    return JSONResponse(new_receiving.__dict__)
    
@router.delete('/delete/{receiving_id}', response_class=HTMLResponse)
async def delete_receiving(receiving_id: int, request: Request, db: Session = Depends(get_db)):
    receiving = db.query(Receiving).filter(Receiving.id == receiving_id).first()
    if not receiving:
        raise HTTPException(status_code=404, detail="Receiving not found")
    
    db.delete(receiving)
    db.commit()
    
    return templates.TemplateResponse('receivings.html', {'request': request, 'message': 'Receiving deleted successfully', 'receivings': db.query(Receiving).all()})