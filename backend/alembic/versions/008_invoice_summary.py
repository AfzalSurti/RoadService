"""Contractor NHAI summary-of-invoice fields on invoices.

Revision ID: 008_invoice_summary
Revises: 007_document_folders
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008_invoice_summary"
down_revision: Union[str, None] = "007_document_folders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("project_title", sa.Text(), nullable=True))
    op.add_column("invoices", sa.Column("authority_engineer", sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("contractor_name", sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("contract_price", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("summary_json", sa.Text(), nullable=True))
    op.add_column("invoices", sa.Column("signature_name", sa.String(255), nullable=True))
    op.add_column("invoices", sa.Column("signature_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "signature_at")
    op.drop_column("invoices", "signature_name")
    op.drop_column("invoices", "summary_json")
    op.drop_column("invoices", "contract_price")
    op.drop_column("invoices", "contractor_name")
    op.drop_column("invoices", "authority_engineer")
    op.drop_column("invoices", "project_title")
