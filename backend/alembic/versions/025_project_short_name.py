"""Project short name for dashboard tiles and pickers; default package overviews.

Revision ID: 025_project_short_name
Revises: 024_notification_link
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.catalog.packages import PACKAGE_OVERVIEWS, PLACEHOLDER_PREFIX

revision: str = "025_project_short_name"
down_revision: Union[str, None] = "024_notification_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SHORT_NAMES = {
    "Jabalpur - Lakhnadon": "Jabalpur – Lakhnadon",
    "Lakhnadon - Khawasa": "Mahagaon – Khawasa",
    "Bokhedi - Kelapur": "Borkhedi – Wadner – Kelapur",
}


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added it.
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS short_name VARCHAR(120)")
    conn = op.get_bind()
    for name, short in SHORT_NAMES.items():
        conn.execute(
            sa.text("UPDATE projects SET short_name = :s WHERE name = :n AND short_name IS NULL"),
            {"n": name, "s": short},
        )
    for name, overview in PACKAGE_OVERVIEWS.items():
        conn.execute(
            sa.text(
                "UPDATE projects SET description = :d WHERE name = :n "
                "AND (description IS NULL OR description LIKE :p)"
            ),
            {"n": name, "d": overview, "p": PLACEHOLDER_PREFIX + "%"},
        )


def downgrade() -> None:
    op.drop_column("projects", "short_name")
