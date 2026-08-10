"""Portal query / ticket raise and resolve workflow.

Revision ID: 012_portal_query_tickets
Revises: 011_org_staff_details
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012_portal_query_tickets"
down_revision: Union[str, None] = "011_org_staff_details"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portal_query_tickets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_no", sa.String(64), nullable=False, unique=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("module_area", sa.String(64), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(32), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("resolved_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_portal_query_status", "portal_query_tickets", ["status"])
    op.create_index("ix_portal_query_raised_by", "portal_query_tickets", ["raised_by_id"])

    op.create_table(
        "portal_query_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("portal_query_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False, server_default="comment"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_portal_query_comments_ticket", "portal_query_comments", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_portal_query_comments_ticket", table_name="portal_query_comments")
    op.drop_table("portal_query_comments")
    op.drop_index("ix_portal_query_raised_by", table_name="portal_query_tickets")
    op.drop_index("ix_portal_query_status", table_name="portal_query_tickets")
    op.drop_table("portal_query_tickets")
