"""Демо-данные для локальной разработки: склады, остатки, заказы, производство и т.д.

Запуск из корня репо:
  uv run python -m backend.app.core.seed_demo_data
  uv run python -m backend.app.core.seed_demo_data --force
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select

from backend.app.core.database import AsyncSessionLocal
from backend.app.models import (
    AuditLog,
    Cell,
    ChzRequest,
    ChzRequestItem,
    ChzRequestStatus,
    Employee,
    EmployeeDepartment,
    EmployeeShift,
    Item,
    ItemInventoryType,
    ManualChzRequest,
    ManualChzRequestItem,
    Order,
    OrderItem,
    OrderItemStatus,
    OrderStatus,
    PackingBox,
    PackingBoxItem,
    PickOperation,
    ProductionChzRequest,
    ProductionChzRequestItem,
    ProductionChzStatus,
    ProductionLaborEntry,
    ProductionOrder,
    ProductionOrderItem,
    ProductionOrderStatus,
    ProductionSupplyRequest,
    ProductionSupplyRequestItem,
    ProductionSupplyStatus,
    ProductionSupplyType,
    ProductionTaskType,
    ProductionTransfer,
    Stock,
    StockInventoryType,
    User,
    Warehouse,
)

DEMO_MARKER_TITLE = "[DEMO]"


async def _already_seeded(session) -> bool:
    result = await session.scalar(select(func.count()).select_from(Item).where(Item.title == DEMO_MARKER_TITLE))
    return bool(result)


async def seed_demo_data(*, force: bool = False) -> dict[str, int]:
    async with AsyncSessionLocal() as session:
        if await _already_seeded(session):
            if not force:
                return {"skipped": 1}
            # force: удаляем только явно помеченные демо-позиции и связанные сущности через cascade не трогаем —
            # проще очистить бизнес-таблицы целиком для локальной sqlite.
            for table in (
                PackingBoxItem,
                PackingBox,
                PickOperation,
                ChzRequestItem,
                ChzRequest,
                ManualChzRequestItem,
                ManualChzRequest,
                ProductionLaborEntry,
                ProductionTransfer,
                ProductionChzRequestItem,
                ProductionChzRequest,
                ProductionSupplyRequestItem,
                ProductionSupplyRequest,
                ProductionOrderItem,
                ProductionOrder,
                EmployeeShift,
                Employee,
                OrderItem,
                Order,
                AuditLog,
                Stock,
                Cell,
                Item,
                Warehouse,
            ):
                await session.execute(table.__table__.delete())
            await session.commit()

        admin = await session.scalar(select(User).where(User.username == "admin"))
        admin_id = admin.id if admin else None
        today = date.today()
        now = datetime.now(UTC)

        wh_main = Warehouse(name="Основной склад")
        wh_raw = Warehouse(name="Склад сырья")
        wh_prod = Warehouse(name="Производство")
        session.add_all([wh_main, wh_raw, wh_prod])
        await session.flush()

        cells_main = [
            Cell(rack=1, tier=1, cell=1, warehouse_id=wh_main.id),
            Cell(rack=1, tier=1, cell=2, warehouse_id=wh_main.id),
            Cell(rack=1, tier=2, cell=1, warehouse_id=wh_main.id),
            Cell(rack=2, tier=1, cell=1, warehouse_id=wh_main.id),
        ]
        cells_raw = [
            Cell(rack=1, tier=1, cell=1, warehouse_id=wh_raw.id),
            Cell(rack=1, tier=1, cell=2, warehouse_id=wh_raw.id),
        ]
        cells_prod = [
            Cell(rack=1, tier=1, cell=1, warehouse_id=wh_prod.id),
        ]
        session.add_all(cells_main + cells_raw + cells_prod)
        await session.flush()

        marker = Item(
            title=DEMO_MARKER_TITLE,
            name="Служебная метка демо-сида (не использовать)",
            product_type="meta",
            size="-",
            color="-",
            inventory_type=ItemInventoryType.consumable,
            max_pairs_per_box=1,
        )
        gloves_m = Item(
            title="Хир. полимер M",
            name="Перчатки хирургические с полимерным покрытием, размер M",
            product_type="gloves",
            size="7,0",
            color="синий",
            inventory_type=ItemInventoryType.finished_goods,
            max_pairs_per_box=100,
        )
        gloves_l = Item(
            title="Хир. полимер L",
            name="Перчатки хирургические с полимерным покрытием, размер L",
            product_type="gloves",
            size="8,0",
            color="синий",
            inventory_type=ItemInventoryType.finished_goods,
            max_pairs_per_box=100,
        )
        exam = Item(
            title="Смотр. нитрил",
            name="Перчатки смотровые нитриловые неопудренные",
            product_type="gloves",
            size="M",
            color="голубой",
            inventory_type=ItemInventoryType.finished_goods,
            max_pairs_per_box=200,
        )
        latex_raw = Item(
            title="Латекс сырьё",
            name="Латексное сырьё для производства перчаток",
            product_type="raw",
            size="-",
            color="натуральный",
            inventory_type=ItemInventoryType.raw_material,
            max_pairs_per_box=1,
        )
        boxes = Item(
            title="Коробка 100",
            name="Картонная коробка под 100 пар",
            product_type="packaging",
            size="-",
            color="бурый",
            inventory_type=ItemInventoryType.consumable,
            max_pairs_per_box=1,
        )
        session.add_all([marker, gloves_m, gloves_l, exam, latex_raw, boxes])
        await session.flush()

        stock_m = Stock(
            item_id=gloves_m.id,
            cell_id=cells_main[0].id,
            pairs_quantity=800,
            reserved_pairs=50,
            pairs_per_box=100,
            batch_number="260401",
            size="7,0",
            color="синий",
            inventory_type=StockInventoryType.finished_goods,
        )
        stock_l = Stock(
            item_id=gloves_l.id,
            cell_id=cells_main[1].id,
            pairs_quantity=500,
            reserved_pairs=0,
            pairs_per_box=100,
            batch_number="260402",
            size="8,0",
            color="синий",
            inventory_type=StockInventoryType.finished_goods,
        )
        stock_exam = Stock(
            item_id=exam.id,
            cell_id=cells_main[2].id,
            pairs_quantity=1200,
            reserved_pairs=0,
            pairs_per_box=200,
            batch_number="260310",
            size="M",
            color="голубой",
            inventory_type=StockInventoryType.finished_goods,
        )
        stock_raw = Stock(
            item_id=latex_raw.id,
            cell_id=cells_raw[0].id,
            pairs_quantity=50,
            reserved_pairs=0,
            inventory_type=StockInventoryType.raw_material,
            manufacturer="Malaysia Latex Co",
        )
        stock_box = Stock(
            item_id=boxes.id,
            cell_id=cells_raw[1].id,
            pairs_quantity=300,
            reserved_pairs=0,
            inventory_type=StockInventoryType.consumable,
            manufacturer="PackCorp",
        )
        stock_move_src = Stock(
            item_id=exam.id,
            cell_id=cells_main[3].id,
            pairs_quantity=100,
            reserved_pairs=0,
            pairs_per_box=200,
            batch_number="260311",
            size="M",
            color="голубой",
            inventory_type=StockInventoryType.finished_goods,
        )
        session.add_all([stock_m, stock_l, stock_exam, stock_raw, stock_box, stock_move_src])
        await session.flush()

        # --- Заказы ---
        order_picking = Order(
            name="ORD-DEMO-001",
            customer="Клиника «Север»",
            status=OrderStatus.picking,
            approved=True,
            shipping_date=now + timedelta(days=2),
            priority=3,
            comment="Демо: в сборке",
            transport_company="Деловые Линии",
            invoice="СФ-1001",
        )
        order_pending = Order(
            name="ORD-DEMO-002",
            customer="Аптека №12",
            status=OrderStatus.pending,
            approved=False,
            shipping_date=now + timedelta(days=5),
            priority=5,
            comment="Демо: ожидает согласования",
        )
        order_packed = Order(
            name="ORD-DEMO-003",
            customer="Госпиталь Центр",
            status=OrderStatus.packed,
            approved=True,
            shipping_date=now + timedelta(days=1),
            priority=2,
            comment="Демо: упакован",
        )
        order_shipped = Order(
            name="ORD-DEMO-004",
            customer="МедСнаб ООО",
            status=OrderStatus.shipped,
            approved=True,
            shipping_date=now - timedelta(days=1),
            actual_shipping_date=now - timedelta(hours=6),
            priority=4,
        )
        session.add_all([order_picking, order_pending, order_packed, order_shipped])
        await session.flush()

        oi_pick = OrderItem(
            order_id=order_picking.id,
            item_id=gloves_m.id,
            pairs_quantity=100,
            picked_pairs=40,
            status=OrderItemStatus.picking,
            suggested_stock_id=stock_m.id,
            item_size="7,0",
            item_color="синий",
            item_name=gloves_m.name,
        )
        oi_pick2 = OrderItem(
            order_id=order_picking.id,
            item_id=gloves_l.id,
            pairs_quantity=50,
            picked_pairs=0,
            status=OrderItemStatus.pending,
            suggested_stock_id=stock_l.id,
            item_size="8,0",
            item_color="синий",
            item_name=gloves_l.name,
        )
        oi_pending = OrderItem(
            order_id=order_pending.id,
            item_id=exam.id,
            pairs_quantity=200,
            suggested_stock_id=stock_exam.id,
            item_size="M",
            item_color="голубой",
            item_name=exam.name,
        )
        oi_packed = OrderItem(
            order_id=order_packed.id,
            item_id=gloves_m.id,
            pairs_quantity=100,
            picked_pairs=100,
            status=OrderItemStatus.picked,
            suggested_stock_id=stock_m.id,
            item_size="7,0",
            item_color="синий",
            item_name=gloves_m.name,
        )
        oi_shipped = OrderItem(
            order_id=order_shipped.id,
            item_id=exam.id,
            pairs_quantity=80,
            picked_pairs=80,
            status=OrderItemStatus.picked,
            suggested_stock_id=stock_exam.id,
            item_size="M",
            item_color="голубой",
            item_name=exam.name,
        )
        session.add_all([oi_pick, oi_pick2, oi_pending, oi_packed, oi_shipped])
        await session.flush()

        session.add(
            PickOperation(
                order_item_id=oi_pick.id,
                stock_id=stock_m.id,
                cell_id=cells_main[0].id,
                item_id=gloves_m.id,
                pairs_quantity=40,
                pairs_per_box=100,
                batch_number="260401",
                size="7,0",
                color="синий",
                user_id=admin_id,
            )
        )
        session.add(
            PickOperation(
                order_item_id=oi_packed.id,
                stock_id=stock_m.id,
                cell_id=cells_main[0].id,
                item_id=gloves_m.id,
                pairs_quantity=100,
                pairs_per_box=100,
                batch_number="260401",
                size="7,0",
                color="синий",
                user_id=admin_id,
            )
        )

        box = PackingBox(order_id=order_packed.id, box_number=1, total_pairs=100)
        session.add(box)
        await session.flush()
        session.add(PackingBoxItem(box_id=box.id, order_item_id=oi_packed.id, pairs_quantity=100))

        chz = ChzRequest(
            order_id=order_packed.id,
            requested_by_user_id=admin_id,
            status=ChzRequestStatus.ready,
            comment="Демо ЧЗ по заказу",
            ready_at=now,
        )
        session.add(chz)
        await session.flush()
        session.add(
            ChzRequestItem(
                chz_request_id=chz.id,
                order_item_id=oi_packed.id,
                item_id=gloves_m.id,
                pairs_quantity=100,
                item_title=gloves_m.title,
                item_size="7,0",
                item_color="синий",
                batch_number="260401",
            )
        )

        manual_chz = ManualChzRequest(
            requested_by_user_id=admin_id,
            status=ChzRequestStatus.requested,
            comment="Демо ручной ЧЗ",
        )
        session.add(manual_chz)
        await session.flush()
        session.add(
            ManualChzRequestItem(
                request_id=manual_chz.id,
                item_id=exam.id,
                pairs_quantity=40,
                item_title=exam.title,
                item_size="M",
                item_color="голубой",
                batch_number="260310",
            )
        )

        # --- Сотрудники ---
        emp1 = Employee(full_name="Иванова Анна", position="Оператор", department=EmployeeDepartment.production)
        emp2 = Employee(full_name="Петров Сергей", position="Кладовщик", department=EmployeeDepartment.warehouse)
        emp3 = Employee(full_name="Сидорова Мария", position="Бригадир", department=EmployeeDepartment.production)
        session.add_all([emp1, emp2, emp3])
        await session.flush()
        for emp, dept in (
            (emp1, EmployeeDepartment.production),
            (emp2, EmployeeDepartment.warehouse),
            (emp3, EmployeeDepartment.production),
        ):
            session.add(
                EmployeeShift(
                    employee_id=emp.id,
                    work_date=today,
                    start_time=time(8, 0),
                    end_time=time(17, 0),
                    department=dept,
                )
            )

        # --- Производство ---
        po_active = ProductionOrder(
            name="PRD-DEMO-001",
            task_type=ProductionTaskType.packaging,
            status=ProductionOrderStatus.in_progress,
            priority=3,
            comment="Демо: упаковка в работе",
            batch_number="260801",
            production_date=today,
            created_by_user_id=admin_id,
            brigadier_user_id=admin_id,
        )
        po_ready = ProductionOrder(
            name="PRD-DEMO-002",
            task_type=ProductionTaskType.repacking,
            status=ProductionOrderStatus.ready_to_work,
            priority=5,
            comment="Демо: готово к работе",
            created_by_user_id=admin_id,
        )
        po_done = ProductionOrder(
            name="PRD-DEMO-003",
            task_type=ProductionTaskType.packaging,
            status=ProductionOrderStatus.completed,
            priority=4,
            batch_number="260715",
            production_date=today - timedelta(days=3),
            created_by_user_id=admin_id,
        )
        session.add_all([po_active, po_ready, po_done])
        await session.flush()

        poi_active = ProductionOrderItem(
            production_order_id=po_active.id,
            item_id=gloves_m.id,
            pairs_quantity=500,
            produced_pairs=200,
            transferred_pairs=0,
            item_size="7,0",
            item_color="синий",
            batch_number="260801",
            production_date=today,
        )
        poi_ready = ProductionOrderItem(
            production_order_id=po_ready.id,
            item_id=exam.id,
            pairs_quantity=300,
            produced_pairs=0,
            item_size="M",
            item_color="голубой",
        )
        poi_done = ProductionOrderItem(
            production_order_id=po_done.id,
            item_id=gloves_l.id,
            pairs_quantity=200,
            produced_pairs=200,
            transferred_pairs=200,
            item_size="8,0",
            item_color="синий",
            batch_number="260715",
            production_date=today - timedelta(days=3),
        )
        session.add_all([poi_active, poi_ready, poi_done])
        await session.flush()

        supply = ProductionSupplyRequest(
            production_order_id=po_active.id,
            request_type=ProductionSupplyType.raw_material,
            status=ProductionSupplyStatus.completed,
            comment="Демо поставка сырья",
        )
        session.add(supply)
        await session.flush()
        session.add(
            ProductionSupplyRequestItem(
                request_id=supply.id,
                item_id=latex_raw.id,
                production_order_item_id=poi_active.id,
                quantity=10,
                fulfilled_quantity=10,
                consumed_quantity=4,
                manufacturer="Malaysia Latex Co",
                selected_stock_id=stock_raw.id,
                selected_cell_id=cells_raw[0].id,
            )
        )

        session.add(
            ProductionTransfer(
                production_order_item_id=poi_done.id,
                stock_id=stock_l.id,
                cell_id=cells_main[1].id,
                pairs_quantity=200,
                created_by_user_id=admin_id,
            )
        )

        pchz = ProductionChzRequest(
            production_order_id=po_active.id,
            requested_by_user_id=admin_id,
            status=ProductionChzStatus.requested,
            comment="Демо ЧЗ производства",
        )
        session.add(pchz)
        await session.flush()
        session.add(
            ProductionChzRequestItem(
                request_id=pchz.id,
                production_order_item_id=poi_active.id,
                item_id=gloves_m.id,
                pairs_quantity=200,
                item_title=gloves_m.title,
                item_size="7,0",
                item_color="синий",
                batch_number="260801",
            )
        )

        session.add(
            ProductionLaborEntry(
                production_order_id=po_active.id,
                employee_id=emp1.id,
                work_date=today,
                start_time=time(9, 0),
                end_time=time(13, 0),
                people_count=1,
                created_by_user_id=admin_id,
                comment="Упаковка утро",
            )
        )
        session.add(
            ProductionLaborEntry(
                production_order_id=po_active.id,
                employee_id=emp3.id,
                work_date=today,
                start_time=time(9, 0),
                end_time=time(17, 0),
                people_count=1,
                created_by_user_id=admin_id,
            )
        )

        # --- История операций ---
        session.add_all(
            [
                AuditLog(
                    operation_type="replenish",
                    user_id=admin_id,
                    item_id=gloves_m.id,
                    stock_id=stock_m.id,
                    cell_id=cells_main[0].id,
                    warehouse_id=wh_main.id,
                    quantity=200,
                    details={"batch_number": "260401", "source": "demo_seed"},
                ),
                AuditLog(
                    operation_type="move",
                    user_id=admin_id,
                    item_id=exam.id,
                    stock_id=stock_move_src.id,
                    cell_id=cells_main[3].id,
                    warehouse_id=wh_main.id,
                    quantity=50,
                    details={
                        "from_cell_id": cells_main[2].id,
                        "to_cell_id": cells_main[3].id,
                        "from_warehouse_id": wh_main.id,
                        "to_warehouse_id": wh_main.id,
                        "source": "demo_seed",
                    },
                ),
                AuditLog(
                    operation_type="create_order",
                    user_id=admin_id,
                    quantity=100,
                    details={"order_id": order_picking.id, "order_name": order_picking.name, "source": "demo_seed"},
                ),
                AuditLog(
                    operation_type="pick",
                    user_id=admin_id,
                    item_id=gloves_m.id,
                    stock_id=stock_m.id,
                    cell_id=cells_main[0].id,
                    warehouse_id=wh_main.id,
                    quantity=40,
                    details={"order_id": order_picking.id, "order_item_id": oi_pick.id, "source": "demo_seed"},
                ),
                AuditLog(
                    operation_type="create_production_order",
                    user_id=admin_id,
                    details={"production_order_id": po_active.id, "name": po_active.name, "source": "demo_seed"},
                ),
                AuditLog(
                    operation_type="stock_withdraw",
                    user_id=admin_id,
                    item_id=exam.id,
                    stock_id=stock_exam.id,
                    cell_id=cells_main[2].id,
                    warehouse_id=wh_main.id,
                    quantity=20,
                    details={"reason": "demo_seed", "comment": "Списание брака"},
                ),
            ]
        )

        await session.commit()

        return {
            "warehouses": 3,
            "cells": len(cells_main) + len(cells_raw) + len(cells_prod),
            "items": 6,
            "stocks": 6,
            "orders": 4,
            "production_orders": 3,
            "employees": 3,
            "chz": 2,
            "audit_logs": 6,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed local WMS demo data")
    parser.add_argument("--force", action="store_true", help="Wipe business tables and reseed")
    args = parser.parse_args()
    counts = asyncio.run(seed_demo_data(force=args.force))
    if counts.get("skipped"):
        print("Demo data already present. Use --force to recreate.")
        return
    print("Demo data seeded:")
    for key, value in counts.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
