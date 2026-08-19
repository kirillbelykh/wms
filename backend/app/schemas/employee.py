from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EmployeeDepartment(str, Enum):
    production = "production"
    warehouse = "warehouse"
    other = "other"


class EmployeeBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EmployeeCreate(BaseModel):
    full_name: str
    position: str | None = None
    department: EmployeeDepartment = EmployeeDepartment.production


class EmployeeUpdate(BaseModel):
    full_name: str | None = None
    position: str | None = None
    department: EmployeeDepartment | None = None
    is_active: bool | None = None


class EmployeeResponse(EmployeeBaseModel):
    id: int
    full_name: str
    position: str | None = None
    department: EmployeeDepartment
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None


class EmployeeShiftCreate(BaseModel):
    employee_id: int
    work_date: date
    start_time: time
    end_time: time
    department: EmployeeDepartment = EmployeeDepartment.production
    comment: str | None = None

    @field_validator("end_time")
    @classmethod
    def ensure_shift_time_order(cls, value: time, info) -> time:
        start_time = info.data.get("start_time")
        if start_time is not None and value <= start_time:
            raise ValueError("end_time must be greater than start_time")
        return value


class EmployeeShiftResponse(EmployeeBaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    work_date: date
    start_time: time
    end_time: time
    department: EmployeeDepartment
    comment: str | None = None
    created_at: datetime


class ProductionLaborEntryCreate(BaseModel):
    work_date: date
    start_time: time
    end_time: time
    people_count: int = Field(default=1, ge=1)
    employee_ids: list[int] = Field(default_factory=list)
    comment: str | None = None

    @field_validator("employee_ids")
    @classmethod
    def unique_employee_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))

    @field_validator("end_time")
    @classmethod
    def ensure_labor_time_order(cls, value: time, info) -> time:
        start_time = info.data.get("start_time")
        if start_time is not None and value <= start_time:
            raise ValueError("end_time must be greater than start_time")
        return value


class ProductionLaborEntryResponse(EmployeeBaseModel):
    id: int
    production_order_id: int
    employee_id: int | None = None
    employee_name: str | None = None
    work_date: date
    start_time: time
    end_time: time
    people_count: int
    comment: str | None = None
    created_by_user_id: int | None = None
    created_at: datetime


class ProductionLaborPeriodReport(BaseModel):
    start_time: time
    end_time: time
    people_count: int
    employee_names: list[str] = Field(default_factory=list)


class ProductionLaborTaskReport(BaseModel):
    production_order_id: int
    production_order_name: str
    task_type: str
    product: str | None = None
    raw_material: str | None = None
    batch_number: str | None = None
    size: str | None = None
    quantity: int
    periods: list[ProductionLaborPeriodReport] = Field(default_factory=list)


class ProductionEmployeeHoursReport(BaseModel):
    employee_id: int | None = None
    employee_name: str
    department: EmployeeDepartment | None = None
    hours: float


class ProductionLaborReportResponse(BaseModel):
    date_from: date
    date_to: date
    tasks: list[ProductionLaborTaskReport] = Field(default_factory=list)
    employees: list[ProductionEmployeeHoursReport] = Field(default_factory=list)
