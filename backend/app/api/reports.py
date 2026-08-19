from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.time import utc_now_naive
from backend.app.dependencies.auth import PermissionChecker
from backend.app.dependencies.database import get_db
from backend.app.models.user import User
from backend.app.schemas.employee import ProductionLaborReportResponse
from backend.app.services.employee import build_production_labor_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/production-labor", response_model=ProductionLaborReportResponse)
async def get_production_labor_report(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(PermissionChecker("view_reports"))],
    date_from: date | None = None,
    date_to: date | None = None,
):
    default_date = utc_now_naive().date() - timedelta(days=1)
    report_from = date_from or default_date
    report_to = date_to or report_from
    return await build_production_labor_report(db, date_from=report_from, date_to=report_to)
