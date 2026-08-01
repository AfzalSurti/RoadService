from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RateItem(Base):
    """BOQ rate line item for a project (as per contract agreement)."""

    __tablename__ = "rate_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    item_no: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    boq_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    boq_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    executed_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False, default=0)
    executed_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project", back_populates="rate_items")
    quantity_entries = relationship(
        "QuantityEntry",
        back_populates="rate_item",
        order_by="QuantityEntry.id.desc()",
        cascade="all, delete-orphan",
    )


class QuantityEntry(Base):
    """Surveyor-entered executed quantity for a BOQ item (This IPC style)."""

    __tablename__ = "quantity_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_item_id: Mapped[int] = mapped_column(ForeignKey("rate_items.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    entered_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rate_item = relationship("RateItem", back_populates="quantity_entries")
    entered_by = relationship("User")
