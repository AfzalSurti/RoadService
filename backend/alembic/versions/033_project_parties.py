"""Project parties for RFI reports (Authority, PIA, Concessionaire, GMC, EPC contractor).

Revision ID: 033_project_parties
Revises: 032_inventory_sheets
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.schema_guard import party_statements

revision: str = "033_project_parties"
down_revision: Union[str, None] = "032_inventory_sheets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS / IS NULL: safe after the app's startup schema guard ran.
    conn = op.get_bind()
    for stmt, params in party_statements():
        conn.execute(sa.text(stmt), params)


def downgrade() -> None:
    for col in ("epc_contractor", "gmc_name", "concessionaire", "project_impl_authority", "authority"):
        op.drop_column("projects", col)
