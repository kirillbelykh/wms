from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.admin import router as admin_router
from backend.app.api.audit import router as audit_router
from backend.app.api.auth import router as auth_router
from backend.app.api.cell import router as cell_router
from backend.app.api.chz import router as chz_router
from backend.app.api.item import router as item_router
from backend.app.api.order import router as order_router
from backend.app.api.picking import router as picking_router
from backend.app.api.production import integration_router as production_integration_router
from backend.app.api.production import router as production_router
from backend.app.api.push import router as push_router
from backend.app.api.employees import router as employees_router
from backend.app.api.reports import router as reports_router
from backend.app.api.roles import router as roles_router
from backend.app.api.stock import router as stock_router
from backend.app.api.warehouses import router as warehouse_router
from backend.app.api.websocket import router as websocket_router
from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal, engine
from backend.app.core.logging import configure_logging, get_logger
from backend.app.core.schema_sync import ensure_runtime_schema
from backend.app.core.seed_permissions import seed_permissions

configure_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    #await ensure_runtime_schema(engine)

    async with AsyncSessionLocal() as session:
        await seed_permissions(session)

    logger.info("WMS API server started")
    yield
    logger.info("WMS API server shutting down")


app = FastAPI(title="WMS API", version="1.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def hello() -> dict[str, str]:
    return {"app": "WMS API", "version": "1.2.0", "status": "running"}


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(roles_router)
app.include_router(warehouse_router)
app.include_router(order_router)
app.include_router(item_router)
app.include_router(cell_router)
app.include_router(stock_router)
app.include_router(picking_router)
app.include_router(production_router)
app.include_router(employees_router)
app.include_router(reports_router)
app.include_router(chz_router)
app.include_router(production_integration_router)
app.include_router(push_router)
app.include_router(websocket_router)
app.include_router(audit_router)
