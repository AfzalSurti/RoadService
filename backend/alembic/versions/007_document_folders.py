"""Document folder hierarchy for stretch / discipline / doc-type.

Revision ID: 007_document_folders
Revises: 006_billing_nhai_cols
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007_document_folders"
down_revision: Union[str, None] = "006_billing_nhai_cols"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_folders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("folder_type", sa.String(32), nullable=False),  # stretch|discipline|doctype
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("document_folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_folders_parent_id", "document_folders", ["parent_id"])
    op.add_column(
        "portal_documents",
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_portal_documents_folder_id", "portal_documents", ["folder_id"])


def downgrade() -> None:
    op.drop_index("ix_portal_documents_folder_id", table_name="portal_documents")
    op.drop_column("portal_documents", "folder_id")
    op.drop_index("ix_document_folders_parent_id", table_name="document_folders")
    op.drop_table("document_folders")
