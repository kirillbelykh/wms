from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/catalogs", tags=["catalogs"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/", response_class=HTMLResponse)
async def catalogs_home(request: Request):
    return templates.TemplateResponse("catalogs/catalogs.html", {"request": request})