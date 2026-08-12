"""Issue location details plus NCR, PMM, critical issues, road warnings.

Revision ID: 018_field_ops_mobile
Revises: 017_invoice_claim_files
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018_field_ops_mobile"
down_revision: Union[str, None] = "017_invoice_claim_files"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("issues", sa.Column("lane", sa.String(length=32), nullable=True))
    op.add_column("issues", sa.Column("side", sa.String(length=32), nullable=True))
    op.add_column("issues", sa.Column("carriageway", sa.String(length=64), nullable=True))
    op.add_column("issues", sa.Column("is_critical", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("issues", sa.Column("start_chainage", sa.String(length=64), nullable=True))
    op.add_column("issues", sa.Column("end_chainage", sa.String(length=64), nullable=True))
    op.add_column("issues", sa.Column("voice_note", sa.Text(), nullable=True))

    op.create_table(
        "site_ncrs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ncr_no", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("related_rfi_id", sa.Integer(), sa.ForeignKey("site_rfis.id", ondelete="SET NULL"), nullable=True),
        sa.Column("chainage_start", sa.String(length=64), nullable=True),
        sa.Column("chainage_end", sa.String(length=64), nullable=True),
        sa.Column("category", sa.String(length=128), nullable=True),
        sa.Column("sub_category", sa.String(length=128), nullable=True),
        sa.Column("item", sa.String(length=128), nullable=True),
        sa.Column("layer", sa.String(length=128), nullable=True),
        sa.Column("side", sa.String(length=32), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("rectification_duration", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("stage", sa.String(length=64), nullable=True),
        sa.Column("block_succeeding_rfis", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("photo_path", sa.String(length=512), nullable=True),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_site_ncrs_project", "site_ncrs", ["project_id"])
    op.create_index("ix_site_ncrs_status", "site_ncrs", ["status"])

    op.create_table(
        "pmm_surveys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("survey_date", sa.Date(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("lane_length_km", sa.Float(), nullable=True),
        sa.Column("distress_json", sa.Text(), nullable=True),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "critical_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("issue_no", sa.String(length=64), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("issue_type", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("expected_resolution", sa.Date(), nullable=True),
        sa.Column("concerned_authority", sa.String(length=255), nullable=True),
        sa.Column("chainage_from", sa.String(length=64), nullable=True),
        sa.Column("chainage_to", sa.String(length=64), nullable=True),
        sa.Column("total_length_km", sa.Float(), nullable=True),
        sa.Column("priority", sa.String(length=32), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "road_warnings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("chainage", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("raised_by_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("road_warnings")
    op.drop_table("critical_issues")
    op.drop_table("pmm_surveys")
    op.drop_index("ix_site_ncrs_status", table_name="site_ncrs")
    op.drop_index("ix_site_ncrs_project", table_name="site_ncrs")
    op.drop_table("site_ncrs")
    op.drop_column("issues", "voice_note")
    op.drop_column("issues", "end_chainage")
    op.drop_column("issues", "start_chainage")
    op.drop_column("issues", "is_critical")
    op.drop_column("issues", "carriageway")
    op.drop_column("issues", "side")
    op.drop_column("issues", "lane")
