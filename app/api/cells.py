from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database.create_db import get_db
from app.models import Cell

router = APIRouter(prefix='/cells', tags=['cells'])

templates = Jinja2Templates(directory='app/templates')


@router.get('/', response_class=HTMLResponse)
async def read_cells(request: Request, db: Session = Depends(get_db)):
    cells = db.query(Cell).all()
    return templates.TemplateResponse('cells.html', {'request': request, 'cells': cells}) 


@router.get('/{cell_id}', response_class=HTMLResponse)
async def read_cell(cell_id: int, request: Request, db: Session = Depends(get_db)):
    cell = db.query(Cell).filter(Cell.id == cell_id).first()
    if not cell:
        raise HTTPException(status_code=404, detail="Cell not found")
    
    return templates.TemplateResponse('cells_detail.html', {'request': request, 'cell': cell})

@router.post('/', response_class=JSONResponse)
async def create_cell(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    new_cell = Cell(
        name=form_data.get('name'),
        description=form_data.get('description'),
        capacity=float(form_data.get('capacity', 0.0))
    )
    
    db.add(new_cell)
    db.commit()
    db.refresh(new_cell)
    
    return JSONResponse(
        {
            "id": new_cell.id,
            "name": new_cell.name,
            "description": new_cell.description or "",
            "capacity": new_cell.capacity
        }
    )

@router.delete('/delete/{cell_id}', response_class=HTMLResponse)
async def delete_cell(cell_id: int, request: Request, db: Session = Depends(get_db)):
    cell = db.query(Cell).filter(Cell.id == cell_id).first()
    if not cell:
        raise HTTPException(status_code=404, detail="Cell not found")
    
    db.delete(cell)
    db.commit()
    
    return templates.TemplateResponse('cells.html', {'request': request, 'message': 'Cell deleted successfully'})