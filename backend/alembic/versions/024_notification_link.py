"""Notification link to the portal page for non-issue alerts.

Revision ID: 024_notification_link
Revises: 023_project_titles
Create Date: 2026-10-17
"""

from typing import Sequence, Union

from alembic import op

revision: str = "024_notification_link"
down_revision: Union[str, None] = "023_project_titles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF NOT EXISTS: the app's startup schema guard may already have added it.
    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255)")


def downgrade() -> None:
    op.drop_column("notifications", "link")
