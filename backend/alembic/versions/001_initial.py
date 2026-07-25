"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-07-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role = sa.Enum("government", "admin", "contractor", "surveyor", name="user_role")
issue_type = sa.Enum(
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
work_category = sa.Enum(
    "pavement",
    "highway",
    "road_furniture",
    "encroachment",
    "drainage",
    "safety",
    "other",
    name="work_category",
)
issue_priority = sa.Enum("low", "medium", "high", "critical", name="issue_priority")
issue_status = sa.Enum(
    "open",
    "in_progress",
    "completed",
    "verification_pending",
    "under_review",
    "closed",
    name="issue_status",
)


def upgrade() -> None:
    bind = op.get_bind()
    # Idempotent enum create (Neon may retain types from a prior failed migration)
    for typ, values in [
        ("user_role", "'government','admin','contractor','surveyor'"),
        (
            "issue_type",
            "'pothole','damaged_road','broken_drainage','encroachment','road_furniture',"
            "'pavement','highway','vehicle_breakdown','unwanted_material','other'",
        ),
        (
            "work_category",
            "'pavement','highway','road_furniture','encroachment','drainage','safety','other'",
        ),
        ("issue_priority", "'low','medium','high','critical'"),
        (
            "issue_status",
            "'open','in_progress','completed','verification_pending','under_review','closed'",
        ),
    ]:
        bind.execute(
            sa.text(
                f"DO $$ BEGIN CREATE TYPE {typ} AS ENUM ({values}); "
                f"EXCEPTION WHEN duplicate_object THEN null; END $$;"
            )
        )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                role user_role NOT NULL,
                phone VARCHAR(32),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))

    # Fall back to original create_table path only when tables missing — use IF NOT EXISTS for all
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(512) NOT NULL,
                description TEXT,
                chainage_from VARCHAR(64),
                chainage_to VARCHAR(64),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_projects_name ON projects (name)"))

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS project_contractors (
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (project_id, user_id)
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS project_surveyors (
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (project_id, user_id)
            )
            """
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS issues (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL REFERENCES projects(id),
                issue_type issue_type NOT NULL,
                work_category work_category NOT NULL,
                description TEXT NOT NULL,
                priority issue_priority NOT NULL,
                status issue_status NOT NULL,
                chainage VARCHAR(64),
                before_photo_path VARCHAR(512) NOT NULL,
                before_lat FLOAT NOT NULL,
                before_lng FLOAT NOT NULL,
                completion_photo_path VARCHAR(512),
                completion_lat FLOAT,
                completion_lng FLOAT,
                completion_remarks TEXT,
                completed_at TIMESTAMPTZ,
                verification_photo_path VARCHAR(512),
                verification_lat FLOAT,
                verification_lng FLOAT,
                verified_at TIMESTAMPTZ,
                deadline_days INTEGER NOT NULL,
                deadline_date DATE NOT NULL,
                reported_by_id INTEGER NOT NULL REFERENCES users(id),
                assigned_contractor_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_issues_project_id ON issues (project_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_issues_status ON issues (status)"))

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS issue_status_history (
                id SERIAL PRIMARY KEY,
                issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
                from_status issue_status,
                to_status issue_status NOT NULL,
                actor_id INTEGER REFERENCES users(id),
                note TEXT,
                created_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_issue_status_history_issue_id ON issue_status_history (issue_id)"
        )
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS issue_rejections (
                id SERIAL PRIMARY KEY,
                issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
                reason TEXT NOT NULL,
                comments TEXT,
                photo_path VARCHAR(512),
                lat FLOAT,
                lng FLOAT,
                rejected_by_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(
        sa.text("CREATE INDEX IF NOT EXISTS ix_issue_rejections_issue_id ON issue_rejections (issue_id)")
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                is_read BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT now()
            )
            """
        )
    )
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)"))


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_table("issue_rejections")
    op.drop_table("issue_status_history")
    op.drop_table("issues")
    op.drop_table("project_surveyors")
    op.drop_table("project_contractors")
    op.drop_table("projects")
    op.drop_table("users")
    issue_status.drop(op.get_bind(), checkfirst=True)
    issue_priority.drop(op.get_bind(), checkfirst=True)
    work_category.drop(op.get_bind(), checkfirst=True)
    issue_type.drop(op.get_bind(), checkfirst=True)
    user_role.drop(op.get_bind(), checkfirst=True)
