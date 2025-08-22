from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Item

router = APIRouter(prefix='/items', tags=['items'])

templates = Jinja2Templates(directory='app/templates')


@router.get('/', response_class=HTMLResponse)
async def read_items(request: Request, db: Session = Depends(get_db)):
    """
    Retrieve a list of items and render them in an HTML template.
    """
    items = db.query(Item).all()
    return templates.TemplateResponse('items.html', {'request': request, 'items': items})

@router.post('/create', response_class=HTMLResponse)
async def create_item(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    name = form_data.get('name')
    description = form_data.get('description')
    
    if not name:
        # простая проверка
        return templates.TemplateResponse('items.html', {
            'request': request,
            'items': db.query(Item).all(),
            'error': 'Название не может быть пустым'
        })
    
    new_item = Item(name=name, description=description)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    
    return templates.TemplateResponse('items.html', {'request': request, 'items': db.query(Item).all()})

@router.delete('/delete/{item_id}', response_class=HTMLResponse)
async def delete_item(item_id: int, db: Session = Depends(get_db), request: Request = None):
    """
    Delete an item by its ID.
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    
    if request:
        return templates.TemplateResponse('items.html', {'request': request, 'items': db.query(Item).all()})
    
    return {"message": "Item deleted successfully"}