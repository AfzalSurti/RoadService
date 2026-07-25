from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole
from app.models.pg_enum import pg_enum


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(pg_enum(UserRole, "user_role"), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    projects_as_contractor = relationship(
        "Project",
        secondary="project_contractors",
        back_populates="contractors",
    )
    projects_as_surveyor = relationship(
        "Project",
        secondary="project_surveyors",
        back_populates="surveyors",
    )
    reported_issues = relationship("Issue", foreign_keys="Issue.reported_by_id", back_populates="reported_by")
    assigned_issues = relationship("Issue", foreign_keys="Issue.assigned_contractor_id", back_populates="assigned_contractor")
    notifications = relationship("Notification", back_populates="user")
