from fastapi import APIRouter

# Импортируем все роутеры
from app.api.operations.receivings import router as receivings_router

from app.api.catalogs.catalogs import router as catalogs_router
from app.api.catalogs.supplies import router as supplies_router
from app.api.catalogs.productions import router as productions_router
from app.api.catalogs.consumables import router as consumables_router
from app.api.catalogs.nomenclature import router as nomenclature_router
from app.api.catalogs.sizes import router as sizes_router
from app.api.catalogs.cells import router as cells_router
from app.api.catalogs.manufacturers import router as manufacturers_router
from app.api.catalogs.materials import router as materials_router
from app.api.catalogs.units import router as units_router
from app.api.catalogs.batches import router as batches_router
from app.api.catalogs.inventory import router as inventory_router
from app.api.catalogs.barcodes import router as barcodes_router
from app.api.tsd.scan import router as scanner_router


# Создаём список всех роутеров
all_routers = [
    receivings_router,
    catalogs_router,
    supplies_router,
    productions_router,
    consumables_router,
    nomenclature_router,
    sizes_router,
    cells_router,
    manufacturers_router,
    materials_router,
    units_router,
    batches_router,
    barcodes_router,
    scanner_router,
    inventory_router,
]