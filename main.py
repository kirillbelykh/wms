from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from app.api import all_routers


templates = Jinja2Templates(directory='app/templates')

app = FastAPI()

@app.get('/')
async def root():
    """
    Root endpoint that renders the main page.
    """
    return templates.TemplateResponse('index.html', {'request': {}})    



for router in all_routers:
    app.include_router(router)