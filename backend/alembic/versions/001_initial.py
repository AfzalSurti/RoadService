"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-07-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role = sa.Enum("government", "admin", "contractor", "surveyor", name="user_role")
issue_type = sa.Enum(
    "pothole",
    "damaged_road",
    "broken_drainage",
    "encroachment",
    "road_furniture",
    "pavement",
    "highway",
    "vehicle_breakdown",
    "unwanted_material",
    "other",
    name="issue_type",
)
work_category = sa.Enum(
    "pavement",
    "highway",
    "road_furniture",
    "encroachment",
    "drainage",
    "safety",
    "other",
    name="work_category",
)
issue_priority = sa.Enum("low", "medium", "high", "critical", name="issue_priority")
issue_status = sa.Enum(
    "open",
    "in_progress",
    "completed",
    "verification_pending",
    "under_review",
    "closed",
    name="issue_status",
)


def upgrade() -> None:
    user_role.create(op.get_bind(), checkfirst=True)
    issue_type.create(op.get_bind(), checkfirst=True)
    work_category.create(op.get_bind(), checkfirst=True)
    issue_priority.create(op.get_bind(), checkfirst=True)
    issue_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("chainage_from", sa.String(64), nullable=True),
        sa.Column("chainage_to", sa.String(64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_projects_name", "projects", ["name"])

    op.create_table(
        "project_contractors",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "project_surveyors",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("issue_type", issue_type, nullable=False),
        sa.Column("work_category", work_category, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", issue_priority, nullable=False),
        sa.Column("status", issue_status, nullable=False),
        sa.Column("chainage", sa.String(64), nullable=True),
        sa.Column("before_photo_path", sa.String(512), nullable=False),
        sa.Column("before_lat", sa.Float(), nullable=False),
        sa.Column("before_lng", sa.Float(), nullable=False),
        sa.Column("completion_photo_path", sa.String(512), nullable=True),
        sa.Column("completion_lat", sa.Float(), nullable=True),
        sa.Column("completion_lng", sa.Float(), nullable=True),
        sa.Column("completion_remarks", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_photo_path", sa.String(512), nullable=True),
        sa.Column("verification_lat", sa.Float(), nullable=True),
        sa.Column("verification_lng", sa.Float(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline_days", sa.Integer(), nullable=False),
        sa.Column("deadline_date", sa.Date(), nullable=False),
        sa.Column("reported_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_contractor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_issues_project_id", "issues", ["project_id"])
    op.create_index("ix_issues_status", "issues", ["status"])

    op.create_table(
        "issue_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", issue_status, nullable=True),
        sa.Column("to_status", issue_status, nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_issue_status_history_issue_id", "issue_status_history", ["issue_id"])

    op.create_table(
        "issue_rejections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("photo_path", sa.String(512), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("rejected_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_issue_rejections_issue_id", "issue_rejections", ["issue_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("issues.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("issue_rejections")
    op.drop_table("issue_status_history")
    op.drop_table("issues")
    op.drop_table("project_surveyors")
    op.drop_table("project_contractors")
    op.drop_table("projects")
    op.drop_table("users")
    issue_status.drop(op.get_bind(), checkfirst=True)
    issue_priority.drop(op.get_bind(), checkfirst=True)
    work_category.drop(op.get_bind(), checkfirst=True)
    issue_type.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)
