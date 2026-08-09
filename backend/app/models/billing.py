from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import InvoiceStatus, PaymentMode
from app.models.pg_enum import pg_enum


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    transaction_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    invoice_no: Mapped[str] = mapped_column(String(64), nullable=False)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payment_mode: Mapped[PaymentMode] = mapped_column(
        pg_enum(PaymentMode, "payment_mode"), default=PaymentMode.FULL, nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    recommended_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    approved_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    upc: Mapped[str | None] = mapped_column(String(128), nullable=True)
    chainage_from: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chainage_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        pg_enum(InvoiceStatus, "invoice_status"), default=InvoiceStatus.SUBMITTED, nullable=False
    )
    submitted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calculation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project")
    submitted_by = relationship("User")
    activities = relationship(
        "InvoiceActivity",
        back_populates="invoice",
        order_by="InvoiceActivity.id",
        cascade="all, delete-orphan",
    )


class InvoiceActivity(Base):
    __tablename__ = "invoice_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invoice = relationship("Invoice", back_populates="activities")
    actor = relationship("User")


class PortalDocument(Base):
    __tablename__ = "portal_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    approval_status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)
    classification: Mapped[str] = mapped_column(String(32), default="internal", nullable=False)
    watermark_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signature_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_out_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    checked_out_by = relationship("User", foreign_keys=[checked_out_by_id])
    project = relationship("Project")


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contractor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    delay_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_matrix: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project")
    contractor_user = relationship("User")
