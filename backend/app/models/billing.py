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
    piu: Mapped[str | None] = mapped_column(String(128), nullable=True)
    faro: Mapped[str | None] = mapped_column(String(128), nullable=True)
    chainage_from: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chainage_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bill_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    bill_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    recommended_ae_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    recommended_piu_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    net_amount_released: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    voucher_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status_detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[InvoiceStatus] = mapped_column(
        pg_enum(InvoiceStatus, "invoice_status"), default=InvoiceStatus.SUBMITTED, nullable=False
    )
    submitted_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calculation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    authority_engineer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contractor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    summary_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    signature_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signature_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    this_bill_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True, deferred=True)
    cumulative_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True, deferred=True)
    contract_amount_cr: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True, deferred=True)
    invoice_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True, deferred=True)
    final_bill_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True, deferred=True)
    diary_note: Mapped[str | None] = mapped_column(Text, nullable=True, deferred=True)
    diary_signature: Mapped[str | None] = mapped_column(String(255), nullable=True, deferred=True)
    correspondence_path: Mapped[str | None] = mapped_column(String(512), nullable=True, deferred=True)
    # GMC MIS Expert gate on contractor-submitted invoices before they reach NHIPMPL
    submitted_by_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gmc_review_status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="approved")
    gmc_remark: Mapped[str | None] = mapped_column(Text, nullable=True)
    gmc_reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    gmc_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project")
    submitted_by = relationship("User", foreign_keys=[submitted_by_id])
    gmc_reviewed_by = relationship("User", foreign_keys=[gmc_reviewed_by_id])
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
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True, index=True)
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
    folder = relationship("DocumentFolder", back_populates="documents")


class DocumentFolder(Base):
    __tablename__ = "document_folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    folder_type: Mapped[str] = mapped_column(String(32), nullable=False)  # stretch|discipline|doctype
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    parent = relationship("DocumentFolder", remote_side=[id], back_populates="children")
    children = relationship("DocumentFolder", back_populates="parent", cascade="all, delete-orphan")
    documents = relationship("PortalDocument", back_populates="folder")
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
    work_order_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    loa_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    type_of_work: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    commencement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    time_limit_completion: Mapped[str | None] = mapped_column(String(128), nullable=True)
    defects_liability_period: Mapped[str | None] = mapped_column(String(128), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project")
    contractor_user = relationship("User")
