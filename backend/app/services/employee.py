from __future__ import annotations

from collections import defaultdict
from datetime import date, time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.exceptions import raise_obj_not_found
from backend.app.models.employee import Employee, EmployeeShift, ProductionLaborEntry
from backend.app.models.production import (
    ProductionOrder,
    ProductionOrderItem,
    ProductionSupplyRequest,
    ProductionSupplyRequestItem,
    ProductionSupplyType,
)
from backend.app.schemas.employee import (
    EmployeeCreate,
    EmployeeResponse,
    EmployeeShiftCreate,
    EmployeeShiftResponse,
    EmployeeUpdate,
    ProductionEmployeeHoursReport,
    ProductionLaborEntryCreate,
    ProductionLaborEntryResponse,
    ProductionLaborPeriodReport,
    ProductionLaborReportResponse,
    ProductionLaborTaskReport,
)


def _entry_hours(start_time: time, end_time: time) -> float:
    start_minutes = start_time.hour * 60 + start_time.minute
    end_minutes = end_time.hour * 60 + end_time.minute
    return max(end_minutes - start_minutes, 0) / 60


def _serialize_employee(employee: Employee) -> EmployeeResponse:
    return EmployeeResponse.model_validate(employee)


def _serialize_shift(shift: EmployeeShift) -> EmployeeShiftResponse:
    return EmployeeShiftResponse(
        id=shift.id,
        employee_id=shift.employee_id,
        employee_name=shift.employee.full_name if shift.employee else None,
        work_date=shift.work_date,
        start_time=shift.start_time,
        end_time=shift.end_time,
        department=shift.department,
        comment=shift.comment,
        created_at=shift.created_at,
    )


def _serialize_labor_entry(entry: ProductionLaborEntry) -> ProductionLaborEntryResponse:
    return ProductionLaborEntryResponse(
        id=entry.id,
        production_order_id=entry.production_order_id,
        employee_id=entry.employee_id,
        employee_name=entry.employee.full_name if entry.employee else None,
        work_date=entry.work_date,
        start_time=entry.start_time,
        end_time=entry.end_time,
        people_count=entry.people_count,
        comment=entry.comment,
        created_by_user_id=entry.created_by_user_id,
        created_at=entry.created_at,
    )


async def list_employees(db: AsyncSession, *, include_inactive: bool = False) -> list[EmployeeResponse]:
    query = select(Employee).order_by(Employee.full_name.asc(), Employee.id.asc())
    if not include_inactive:
        query = query.where(Employee.is_active.is_(True))
    return [_serialize_employee(employee) for employee in (await db.scalars(query)).all()]


async def create_employee(db: AsyncSession, payload: EmployeeCreate) -> EmployeeResponse:
    employee = Employee(
        full_name=payload.full_name.strip(),
        position=payload.position.strip() if payload.position else None,
        department=payload.department,
        is_active=True,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return _serialize_employee(employee)


async def update_employee(db: AsyncSession, employee_id: int, payload: EmployeeUpdate) -> EmployeeResponse:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise_obj_not_found("Employee")

    for field_name, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(employee, field_name, value)

    await db.commit()
    await db.refresh(employee)
    return _serialize_employee(employee)


async def deactivate_employee(db: AsyncSession, employee_id: int) -> EmployeeResponse:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise_obj_not_found("Employee")
    employee.is_active = False
    await db.commit()
    await db.refresh(employee)
    return _serialize_employee(employee)


async def delete_employee(db: AsyncSession, employee_id: int) -> EmployeeResponse:
    employee = await db.get(Employee, employee_id)
    if employee is None:
        raise_obj_not_found("Employee")

    snapshot = _serialize_employee(employee)
    await db.delete(employee)
    await db.commit()
    return snapshot


async def list_employee_shifts(
    db: AsyncSession,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[EmployeeShiftResponse]:
    query = select(EmployeeShift).options(selectinload(EmployeeShift.employee)).order_by(
        EmployeeShift.work_date.desc(),
        EmployeeShift.start_time.asc(),
        EmployeeShift.id.asc(),
    )
    if date_from is not None:
        query = query.where(EmployeeShift.work_date >= date_from)
    if date_to is not None:
        query = query.where(EmployeeShift.work_date <= date_to)
    return [_serialize_shift(shift) for shift in (await db.scalars(query)).all()]


async def create_employee_shift(db: AsyncSession, payload: EmployeeShiftCreate) -> EmployeeShiftResponse:
    employee = await db.get(Employee, payload.employee_id)
    if employee is None:
        raise_obj_not_found("Employee")
    shift = EmployeeShift(
        employee_id=payload.employee_id,
        work_date=payload.work_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        department=payload.department,
        comment=payload.comment.strip() if payload.comment else None,
    )
    db.add(shift)
    await db.commit()
    shift = await db.scalar(
        select(EmployeeShift)
        .options(selectinload(EmployeeShift.employee))
        .where(EmployeeShift.id == shift.id)
    )
    if shift is None:
        raise_obj_not_found("EmployeeShift")
    return _serialize_shift(shift)


async def delete_employee_shift(db: AsyncSession, shift_id: int) -> None:
    shift = await db.get(EmployeeShift, shift_id)
    if shift is None:
        raise_obj_not_found("EmployeeShift")
    await db.delete(shift)
    await db.commit()


async def list_production_labor_entries(db: AsyncSession, production_order_id: int) -> list[ProductionLaborEntryResponse]:
    query = (
        select(ProductionLaborEntry)
        .options(selectinload(ProductionLaborEntry.employee))
        .where(ProductionLaborEntry.production_order_id == production_order_id)
        .order_by(ProductionLaborEntry.work_date.desc(), ProductionLaborEntry.start_time.asc(), ProductionLaborEntry.id.asc())
    )
    return [_serialize_labor_entry(entry) for entry in (await db.scalars(query)).all()]


async def create_production_labor_entries(
    db: AsyncSession,
    production_order_id: int,
    payload: ProductionLaborEntryCreate,
    *,
    created_by_user_id: int | None,
) -> list[ProductionLaborEntryResponse]:
    order = await db.get(ProductionOrder, production_order_id)
    if order is None:
        raise_obj_not_found("ProductionOrder")

    employee_ids = payload.employee_ids
    if employee_ids:
        found_employee_ids = set(
            (await db.scalars(select(Employee.id).where(Employee.id.in_(employee_ids), Employee.is_active.is_(True)))).all()
        )
        missing_ids = [employee_id for employee_id in employee_ids if employee_id not in found_employee_ids]
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"Employees not found: {', '.join(map(str, missing_ids))}")
    else:
        employee_ids = [None]

    entries: list[ProductionLaborEntry] = []
    for employee_id in employee_ids:
        entry = ProductionLaborEntry(
            production_order_id=production_order_id,
            employee_id=employee_id,
            work_date=payload.work_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            people_count=1 if employee_id is not None else payload.people_count,
            comment=payload.comment.strip() if payload.comment else None,
            created_by_user_id=created_by_user_id,
        )
        db.add(entry)
        entries.append(entry)

    await db.commit()
    entry_ids = [entry.id for entry in entries]
    saved_entries = list(
        (
            await db.scalars(
                select(ProductionLaborEntry)
                .options(selectinload(ProductionLaborEntry.employee))
                .where(ProductionLaborEntry.id.in_(entry_ids))
                .order_by(ProductionLaborEntry.id.asc())
            )
        ).all()
    )
    return [_serialize_labor_entry(entry) for entry in saved_entries]


async def delete_production_labor_entry(db: AsyncSession, production_order_id: int, entry_id: int) -> None:
    entry = await db.get(ProductionLaborEntry, entry_id)
    if entry is None or entry.production_order_id != production_order_id:
        raise_obj_not_found("ProductionLaborEntry")
    await db.delete(entry)
    await db.commit()


async def build_production_labor_report(
    db: AsyncSession,
    *,
    date_from: date,
    date_to: date,
) -> ProductionLaborReportResponse:
    entries = list(
        (
            await db.scalars(
                select(ProductionLaborEntry)
                .options(
                    selectinload(ProductionLaborEntry.employee),
                    selectinload(ProductionLaborEntry.production_order)
                    .selectinload(ProductionOrder.items)
                    .selectinload(ProductionOrderItem.item),
                    selectinload(ProductionLaborEntry.production_order)
                    .selectinload(ProductionOrder.supply_requests)
                    .selectinload(ProductionSupplyRequest.items)
                    .selectinload(ProductionSupplyRequestItem.item),
                )
                .where(
                    ProductionLaborEntry.work_date >= date_from,
                    ProductionLaborEntry.work_date <= date_to,
                )
                .order_by(ProductionLaborEntry.work_date.asc(), ProductionLaborEntry.start_time.asc(), ProductionLaborEntry.id.asc())
            )
        ).all()
    )

    task_periods: dict[int, dict[tuple[date, time, time], dict[str, object]]] = defaultdict(dict)
    employee_hours: dict[int | None, dict[str, object]] = {}

    for entry in entries:
        period_key = (entry.work_date, entry.start_time, entry.end_time)
        task_bucket = task_periods[entry.production_order_id]
        period = task_bucket.setdefault(period_key, {"people_count": 0, "employee_names": []})
        period["people_count"] = int(period["people_count"]) + entry.people_count
        if entry.employee is not None:
            employee_names = period["employee_names"]
            if isinstance(employee_names, list):
                employee_names.append(entry.employee.full_name)

        hours = _entry_hours(entry.start_time, entry.end_time) * entry.people_count
        employee_key = entry.employee_id
        employee_summary = employee_hours.setdefault(
            employee_key,
            {
                "employee_id": entry.employee_id,
                "employee_name": entry.employee.full_name if entry.employee else "Без указания сотрудника",
                "department": entry.employee.department if entry.employee else None,
                "hours": 0.0,
            },
        )
        employee_summary["hours"] = round(float(employee_summary["hours"]) + hours, 2)

    tasks: list[ProductionLaborTaskReport] = []
    seen_order_ids: set[int] = set()
    for entry in entries:
        order = entry.production_order
        if order.id in seen_order_ids:
            continue
        seen_order_ids.add(order.id)

        primary_item = order.items[0] if order.items else None
        raw_materials = [
            item.item.title if item.item else f"#{item.item_id}"
            for request in order.supply_requests
            if request.request_type == ProductionSupplyType.raw_material
            for item in request.items
        ]
        periods = [
            ProductionLaborPeriodReport(
                start_time=start_time,
                end_time=end_time,
                people_count=int(data["people_count"]),
                employee_names=sorted(set(data["employee_names"])) if isinstance(data["employee_names"], list) else [],
            )
            for (_work_date, start_time, end_time), data in sorted(task_periods[order.id].items())
        ]
        tasks.append(
            ProductionLaborTaskReport(
                production_order_id=order.id,
                production_order_name=order.name,
                task_type=order.task_type.value if hasattr(order.task_type, "value") else str(order.task_type),
                product=primary_item.item.title if primary_item and primary_item.item else None,
                raw_material=", ".join(sorted(set(raw_materials))) if raw_materials else None,
                batch_number=primary_item.batch_number if primary_item else order.batch_number,
                size=primary_item.item_size if primary_item else None,
                quantity=sum(item.pairs_quantity for item in order.items),
                periods=periods,
            )
        )

    employees = [
        ProductionEmployeeHoursReport(**summary)
        for summary in sorted(employee_hours.values(), key=lambda item: str(item["employee_name"]))
    ]
    return ProductionLaborReportResponse(date_from=date_from, date_to=date_to, tasks=tasks, employees=employees)
