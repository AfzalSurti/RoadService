"""Invoice claim amounts, PDF bills, and diary fields.

Revision ID: 017_invoice_claim_files
Revises: 016_executive_drawings
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017_invoice_claim_files"
down_revision: Union[str, None] = "016_executive_drawings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("this_bill_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("cumulative_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("contract_amount_cr", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("invoice_pdf_path", sa.String(length=512), nullable=True))
    op.add_column("invoices", sa.Column("final_bill_pdf_path", sa.String(length=512), nullable=True))
    op.add_column("invoices", sa.Column("diary_note", sa.Text(), nullable=True))
    op.add_column("invoices", sa.Column("diary_signature", sa.String(length=255), nullable=True))
    op.add_column("invoices", sa.Column("correspondence_path", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "correspondence_path")
    op.drop_column("invoices", "diary_signature")
    op.drop_column("invoices", "diary_note")
    op.drop_column("invoices", "final_bill_pdf_path")
    op.drop_column("invoices", "invoice_pdf_path")
    op.drop_column("invoices", "contract_amount_cr")
    op.drop_column("invoices", "cumulative_amount")
    op.drop_column("invoices", "this_bill_amount")
