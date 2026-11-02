"""Project tile photo.

Revision ID: 026_project_image
Revises: 025_project_short_name
Create Date: 2026-11-02
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.catalog.packages import PACKAGE_IMAGES

revision: str = "026_project_image"
down_revision: Union[str, None] = "025_project_short_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added it.
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url VARCHAR(1024)")
    conn = op.get_bind()
    for name, image in PACKAGE_IMAGES.items():
        conn.execute(
            sa.text("UPDATE projects SET image_url = :i WHERE name = :n AND image_url IS NULL"),
            {"n": name, "i": image},
        )


def downgrade() -> None:
    op.drop_column("projects", "image_url")
