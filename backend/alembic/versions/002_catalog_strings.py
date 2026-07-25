"""Convert issue_type / work_category enums to varchar catalog IDs.

Revision ID: 002_catalog_strings
Revises: 001_initial
Create Date: 2026-07-25
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002_catalog_strings"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cast enum columns to varchar for catalog IDs (ATMS-1, S1, …)
    # Safe if already varchar from a prior partial run
    op.execute(
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='issues' AND column_name='issue_type'
              AND udt_name = 'issue_type'
          ) THEN
            ALTER TABLE issues ALTER COLUMN issue_type TYPE VARCHAR(64) USING issue_type::text;
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='issues' AND column_name='work_category'
              AND udt_name = 'work_category'
          ) THEN
            ALTER TABLE issues ALTER COLUMN work_category TYPE VARCHAR(64) USING work_category::text;
          END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE issues ALTER COLUMN before_photo_path TYPE VARCHAR(1024)")
    op.execute("ALTER TABLE issues ALTER COLUMN completion_photo_path TYPE VARCHAR(1024)")
    op.execute("ALTER TABLE issues ALTER COLUMN verification_photo_path TYPE VARCHAR(1024)")
    op.execute("ALTER TABLE issue_rejections ALTER COLUMN photo_path TYPE VARCHAR(1024)")

    op.execute("CREATE INDEX IF NOT EXISTS ix_issues_issue_type ON issues (issue_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_issues_work_category ON issues (work_category)")

    op.execute("DROP TYPE IF EXISTS issue_type")
    op.execute("DROP TYPE IF EXISTS work_category")


def downgrade() -> None:
    op.drop_index("ix_issues_work_category", table_name="issues")
    op.drop_index("ix_issues_issue_type", table_name="issues")

    issue_type = postgresql.ENUM(
        "pothole",
        "damaged_road",
        "broken_drainage",
        "encroachment",
        "road_furniture",
        "pavement",
        "highway",
        "vehicle_breakdown",
        "unwanted_material",
        "other",
        name="issue_type",
    )
    work_category = postgresql.ENUM(
        "pavement",
        "highway",
        "road_furniture",
        "encroachment",
        "drainage",
        "safety",
        "other",
        name="work_category",
    )
    issue_type.create(op.get_bind(), checkfirst=True)
    work_category.create(op.get_bind(), checkfirst=True)

    op.execute("ALTER TABLE issues ALTER COLUMN issue_type TYPE issue_type USING 'other'::issue_type")
    op.execute(
        "ALTER TABLE issues ALTER COLUMN work_category TYPE work_category USING 'other'::work_category"
    )
