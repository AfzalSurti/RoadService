from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import IssuePriority, IssueStatus, IssueType, WorkCategory


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    issue_type: Mapped[IssueType] = mapped_column(Enum(IssueType, name="issue_type"), nullable=False)
    work_category: Mapped[WorkCategory] = mapped_column(
        Enum(WorkCategory, name="work_category"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[IssuePriority] = mapped_column(
        Enum(IssuePriority, name="issue_priority"), default=IssuePriority.MEDIUM
    )
    status: Mapped[IssueStatus] = mapped_column(
        Enum(IssueStatus, name="issue_status"), default=IssueStatus.OPEN, index=True
    )
    chainage: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Before (creation) — surveyor
    before_photo_path: Mapped[str] = mapped_column(String(512), nullable=False)
    before_lat: Mapped[float] = mapped_column(Float, nullable=False)
    before_lng: Mapped[float] = mapped_column(Float, nullable=False)

    # Completion — contractor
    completion_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    completion_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    completion_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    completion_remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Verification — surveyor
    verification_photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    verification_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    verification_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    deadline_days: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    deadline_date: Mapped[date] = mapped_column(Date, nullable=False)

    reported_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    assigned_contractor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project = relationship("Project", back_populates="issues")
    reported_by = relationship("User", foreign_keys=[reported_by_id], back_populates="reported_issues")
    assigned_contractor = relationship(
        "User", foreign_keys=[assigned_contractor_id], back_populates="assigned_issues"
    )
    status_history = relationship("IssueStatusHistory", back_populates="issue", order_by="IssueStatusHistory.created_at")
    rejection_history = relationship("IssueRejection", back_populates="issue", order_by="IssueRejection.created_at")


_issue_status_enum = Enum(IssueStatus, name="issue_status", create_constraint=False)


class IssueStatusHistory(Base):
    __tablename__ = "issue_status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True)
    from_status: Mapped[IssueStatus | None] = mapped_column(_issue_status_enum, nullable=True)
    to_status: Mapped[IssueStatus] = mapped_column(_issue_status_enum, nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    issue = relationship("Issue", back_populates="status_history")
    actor = relationship("User")

class IssueRejection(Base):
    __tablename__ = "issue_rejections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id", ondelete="CASCADE"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    rejected_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    issue = relationship("Issue", back_populates="rejection_history")
    rejected_by = relationship("User")
