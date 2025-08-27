from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from app.api import all_routers


templates = Jinja2Templates(directory='app/templates')

app = FastAPI()

# Добавьте CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Для разработки, в продакшене укажите конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
async def root():
    """
    Root endpoint that renders the main page.
    """
    return templates.TemplateResponse('index.html', {'request': {}})    



for router in all_routers:
    app.include_router(router)
    
