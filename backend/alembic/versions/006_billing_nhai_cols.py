"""Billing invoice NHAI-style columns.

Revision ID: 006_billing_nhai_cols
Revises: 005_nhit_portal
Create Date: 2026-08-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006_billing_nhai_cols"
down_revision: Union[str, None] = "005_nhit_portal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("piu", sa.String(128), nullable=True))
    op.add_column("invoices", sa.Column("faro", sa.String(128), nullable=True))
    op.add_column("invoices", sa.Column("bill_from", sa.Date(), nullable=True))
    op.add_column("invoices", sa.Column("bill_to", sa.Date(), nullable=True))
    op.add_column("invoices", sa.Column("recommended_ae_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("recommended_piu_amount", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("net_amount_released", sa.Numeric(18, 2), nullable=True))
    op.add_column("invoices", sa.Column("voucher_no", sa.String(64), nullable=True))
    op.add_column("invoices", sa.Column("status_detail", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "status_detail")
    op.drop_column("invoices", "voucher_no")
    op.drop_column("invoices", "net_amount_released")
    op.drop_column("invoices", "recommended_piu_amount")
    op.drop_column("invoices", "recommended_ae_amount")
    op.drop_column("invoices", "bill_to")
    op.drop_column("invoices", "bill_from")
    op.drop_column("invoices", "faro")
    op.drop_column("invoices", "piu")
