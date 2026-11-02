"""Vendor extension of time (EOT), in days.

Revision ID: 027_vendor_eot
Revises: 026_project_image
Create Date: 2026-11-02
"""

from typing import Sequence, Union

from alembic import op

revision: str = "027_vendor_eot"
down_revision: Union[str, None] = "026_project_image"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added it.
    op.execute("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS extension_of_time VARCHAR(128)")


def downgrade() -> None:
    op.drop_column("vendors", "extension_of_time")
