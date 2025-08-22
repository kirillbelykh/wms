from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from app.api.items import router as items_router

templates = Jinja2Templates(directory='app/templates')

app = FastAPI()

@app.get('/')
async def root():
    """
    Root endpoint that renders the main page.
    """
    return templates.TemplateResponse('index.html', {'request': {}})    



app.include_router(items_router)

