from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.dependencies.auth import PermissionChecker
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.employee import (
    EmployeeCreate,
    EmployeeResponse,
    EmployeeShiftCreate,
    EmployeeShiftResponse,
    EmployeeUpdate,
)
from backend.app.services.employee import (
    create_employee,
    create_employee_shift,
    deactivate_employee,
    delete_employee,
    delete_employee_shift,
    list_employee_shifts,
    list_employees,
    update_employee,
)

router = APIRouter(tags=["employees"])


@router.get("/employees", response_model=list[EmployeeResponse])
async def get_employees(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_employees"))],
    include_inactive: bool = False,
):
    return await list_employees(db, include_inactive=include_inactive)


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create(
    payload: EmployeeCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_employees"))],
):
    return await create_employee(db, payload)


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_employees"))],
):
    return await update_employee(db, employee_id, payload)


@router.delete("/employees/{employee_id}", response_model=EmployeeResponse)
async def delete(
    employee_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_employees"))],
    hard: bool = False,
):
    if hard:
        return await delete_employee(db, employee_id)
    return await deactivate_employee(db, employee_id)


@router.get("/employee-shifts", response_model=list[EmployeeShiftResponse])
async def get_shifts(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_employees"))],
    date_from: date | None = None,
    date_to: date | None = None,
):
    return await list_employee_shifts(db, date_from=date_from, date_to=date_to)


@router.post("/employee-shifts", response_model=EmployeeShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    payload: EmployeeShiftCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_employee_shifts"))],
):
    return await create_employee_shift(db, payload)


@router.delete("/employee-shifts/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shift(
    shift_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("manage_employee_shifts"))],
):
    await delete_employee_shift(db, shift_id)
