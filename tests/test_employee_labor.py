from __future__ import annotations

import pytest
from sqlalchemy import select

from backend.app.models.employee import EmployeeShift, ProductionLaborEntry
from backend.app.models.item import Item, ItemInventoryType
from backend.app.models.production import ProductionOrder, ProductionOrderItem

pytestmark = pytest.mark.asyncio


async def test_production_labor_entries_are_visible_in_order_and_report(client, db_session, auth_headers):
    item = Item(
        title="Labor gloves",
        name="Labor gloves M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    employee_response = await client.post(
        "/employees",
        headers=auth_headers,
        json={
            "full_name": "Иванов Иван",
            "position": "Упаковщик",
            "department": "production",
        },
    )
    assert employee_response.status_code == 201
    employee_id = employee_response.json()["id"]

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "PROD-LABOR",
            "priority": 5,
            "items": [{"item_id": item.id, "pairs_quantity": 100}],
        },
    )
    assert production_response.status_code == 200
    production_order_id = production_response.json()["id"]

    labor_response = await client.post(
        f"/production-orders/{production_order_id}/labor",
        headers=auth_headers,
        json={
            "work_date": "2026-07-02",
            "start_time": "08:00",
            "end_time": "12:00",
            "people_count": 1,
            "employee_ids": [employee_id],
            "comment": "Утренняя смена",
        },
    )
    assert labor_response.status_code == 200
    labor_payload = labor_response.json()
    assert labor_payload[0]["employee_name"] == "Иванов Иван"
    assert labor_payload[0]["people_count"] == 1

    order_response = await client.get(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    order_payload = order_response.json()
    assert order_payload["labor_entries"][0]["employee_name"] == "Иванов Иван"

    report_response = await client.get(
        "/reports/production-labor",
        headers=auth_headers,
        params={"date_from": "2026-07-02", "date_to": "2026-07-02"},
    )
    assert report_response.status_code == 200
    report_payload = report_response.json()
    assert report_payload["tasks"][0]["production_order_name"] == "PROD-LABOR"
    assert report_payload["tasks"][0]["periods"][0]["people_count"] == 1
    assert report_payload["employees"][0]["employee_name"] == "Иванов Иван"
    assert report_payload["employees"][0]["hours"] == 4.0


async def test_hard_delete_employee_removes_employee_and_detaches_labor_entries(client, db_session, auth_headers):
    item = Item(
        title="Delete employee gloves",
        name="Delete employee gloves M",
        product_type="gloves",
        size="M",
        color="natural",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)

    employee_response = await client.post(
        "/employees",
        headers=auth_headers,
        json={
            "full_name": "Петров Петр",
            "position": "Оператор",
            "department": "production",
        },
    )
    assert employee_response.status_code == 201
    employee_id = employee_response.json()["id"]

    shift_response = await client.post(
        "/employee-shifts",
        headers=auth_headers,
        json={
            "employee_id": employee_id,
            "work_date": "2026-07-03",
            "start_time": "08:00",
            "end_time": "17:00",
            "department": "production",
        },
    )
    assert shift_response.status_code == 201

    production_response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
          "name": "PROD-DELETE-EMPLOYEE",
          "priority": 5,
          "items": [{"item_id": item.id, "pairs_quantity": 100}],
        },
    )
    assert production_response.status_code == 200
    production_order_id = production_response.json()["id"]

    labor_response = await client.post(
        f"/production-orders/{production_order_id}/labor",
        headers=auth_headers,
        json={
            "work_date": "2026-07-03",
            "start_time": "09:00",
            "end_time": "12:00",
            "people_count": 1,
            "employee_ids": [employee_id],
        },
    )
    assert labor_response.status_code == 200

    delete_response = await client.delete(
        f"/employees/{employee_id}",
        headers=auth_headers,
        params={"hard": True},
    )
    assert delete_response.status_code == 200

    assert await db_session.get(EmployeeShift, shift_response.json()["id"]) is None
    labor_entry = await db_session.scalar(select(ProductionLaborEntry).where(ProductionLaborEntry.production_order_id == production_order_id))
    assert labor_entry is not None
    assert labor_entry.employee_id is None

    employees_response = await client.get("/employees", headers=auth_headers, params={"include_inactive": True})
    assert employees_response.status_code == 200
    assert all(employee["id"] != employee_id for employee in employees_response.json())

    order_response = await client.get(f"/production-orders/{production_order_id}", headers=auth_headers)
    assert order_response.status_code == 200
    assert order_response.json()["labor_entries"][0]["employee_id"] is None
    assert order_response.json()["labor_entries"][0]["employee_name"] is None


async def test_support_production_task_can_be_created_without_items(client, auth_headers):
    response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "WAREHOUSE-HELP-1",
            "task_type": "warehouse_help",
            "priority": 3,
            "items": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_type"] == "warehouse_help"
    assert payload["items"] == []


async def test_non_support_production_task_still_requires_items(client, auth_headers):
    response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "EMPTY-PACKAGING",
            "task_type": "packaging",
            "priority": 5,
            "items": [],
        },
    )

    assert response.status_code == 400


async def test_unpacking_task_allows_raw_material_items(client, db_session, auth_headers):
    raw_item = Item(
        title="Raw latex",
        name="Raw latex M",
        product_type="gloves",
        size="M",
        color="natural",
        inventory_type=ItemInventoryType.raw_material,
        max_pairs_per_box=125,
    )
    db_session.add(raw_item)
    await db_session.commit()
    await db_session.refresh(raw_item)

    response = await client.post(
        "/production-orders",
        headers=auth_headers,
        json={
            "name": "UNPACK-RAW",
            "task_type": "unpacking",
            "priority": 5,
            "items": [{"item_id": raw_item.id, "pairs_quantity": 100}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["task_type"] == "unpacking"
    assert payload["items"][0]["item_id"] == raw_item.id


async def test_legacy_default_task_type_is_serialized_as_packaging(client, db_session, auth_headers):
    item = Item(
        title="Legacy production gloves",
        name="Legacy production gloves 7.0",
        product_type="gloves",
        size="7.0",
        color="natural",
        max_pairs_per_box=100,
    )
    db_session.add(item)
    await db_session.flush()

    order = ProductionOrder(name="LEGACY-DEFAULT-TYPE", task_type="default")
    db_session.add(order)
    await db_session.flush()

    db_session.add(
        ProductionOrderItem(
            production_order_id=order.id,
            item_id=item.id,
            pairs_quantity=10,
        )
    )
    await db_session.commit()

    response = await client.get("/production-orders", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["name"] == "LEGACY-DEFAULT-TYPE"
    assert payload[0]["task_type"] == "packaging"
