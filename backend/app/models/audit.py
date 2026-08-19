from __future__ import annotations

from datetime import datetime

from sqlalchemy import ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.db_base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    operation_type: Mapped[str] = mapped_column(String(50), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id", ondelete="SET NULL"), nullable=True)
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("stocks.id", ondelete="SET NULL"), nullable=True)
    cell_id: Mapped[int | None] = mapped_column(ForeignKey("cells.id", ondelete="SET NULL"), nullable=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
