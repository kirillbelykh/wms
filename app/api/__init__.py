from fastapi import APIRouter

# Импортируем все роутеры
from app.api.orders import router as orders_router
from app.api.receivings import router as receivings_router

from app.api.catalogs.catalogs import router as catalogs_router
from app.api.catalogs.items import router as items_router
from app.api.catalogs.item_types import router as item_types_router
from app.api.catalogs.sizes import router as sizes_router
from app.api.catalogs.cells import router as cells_router
from app.api.catalogs.manufacturers import router as manufacturers_router
from app.api.catalogs.materials import router as materials_router
from app.api.catalogs.units import router as units_router
from app.api.catalogs.batches import router as batches_router
from app.api.catalogs.barcodes import router as barcodes_router

# Создаём список всех роутеров
all_routers = [
    orders_router,
    receivings_router,
    catalogs_router,
    items_router,
    item_types_router,
    sizes_router,
    cells_router,
    manufacturers_router,
    materials_router,
    units_router,
    batches_router,
    barcodes_router,
]