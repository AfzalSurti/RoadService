"""Rename the MPR document folders to MSR (Monthly Status Report).

Revision ID: 034_msr_folder
Revises: 033_project_parties
Create Date: 2026-11-02
"""

from typing import Sequence, Union

from alembic import op

from app.core.schema_guard import MSR_FOLDER_RENAME

revision: str = "034_msr_folder"
down_revision: Union[str, None] = "033_project_parties"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(MSR_FOLDER_RENAME)


def downgrade() -> None:
    op.execute(
        "UPDATE document_folders SET name = 'Monthly Progress Reports (MPR)' "
        "WHERE name = 'Monthly Status Reports (MSR)'"
    )
