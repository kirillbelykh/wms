from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from backend.app.core.logging import get_logger


logger = get_logger(__name__)


async def ensure_runtime_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        table_names = await connection.run_sync(lambda sync_connection: set(inspect(sync_connection).get_table_names()))
        if "items" not in table_names:
            return

        item_columns = await connection.run_sync(
            lambda sync_connection: {column["name"] for column in inspect(sync_connection).get_columns("items")}
        )

        if "inventory_type" not in item_columns:
            logger.warning("Adding missing items.inventory_type column")
            await connection.execute(text("ALTER TABLE items ADD COLUMN inventory_type VARCHAR(32)"))

        await connection.execute(text("UPDATE items SET inventory_type = 'finished_goods' WHERE inventory_type IS NULL"))

        if connection.dialect.name == "postgresql":
            await connection.execute(text("ALTER TABLE items ALTER COLUMN inventory_type SET DEFAULT 'finished_goods'"))
            await connection.execute(text("ALTER TABLE items ALTER COLUMN inventory_type SET NOT NULL"))

        if "production_order_items" in table_names:
            production_order_item_columns = await connection.run_sync(
                lambda sync_connection: {
                    column["name"] for column in inspect(sync_connection).get_columns("production_order_items")
                }
            )
            if "produced_pairs" not in production_order_item_columns:
                logger.warning("Adding missing production_order_items.produced_pairs column")
                await connection.execute(text("ALTER TABLE production_order_items ADD COLUMN produced_pairs INTEGER"))

            await connection.execute(text("UPDATE production_order_items SET produced_pairs = COALESCE(produced_pairs, 0)"))

            if connection.dialect.name == "postgresql":
                await connection.execute(text("ALTER TABLE production_order_items ALTER COLUMN produced_pairs SET DEFAULT 0"))
                await connection.execute(text("ALTER TABLE production_order_items ALTER COLUMN produced_pairs SET NOT NULL"))
