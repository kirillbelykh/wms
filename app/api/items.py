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

@router.get('/create', response_class=HTMLResponse)
async def create_item(request: Request, db: Session = Depends(get_db)):
    """
    Create a new item and redirect to the items list.
    """
    form_data = await request.form()
    new_item = Item(name=form_data.get('name'), description=form_data.get('description'))
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return templates.TemplateResponse('items.html', {'request': request, 'items': db.query(Item).all()})
