"""Project official titles; load the three O&M packages, retire the demo project.

Revision ID: 023_project_titles
Revises: 022_invoice_gmc_review
Create Date: 2026-10-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_project_titles"
down_revision: Union[str, None] = "022_invoice_gmc_review"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Short `name` is kept as the key used by document folders / MPR / NHIT.
PACKAGES = [
    (
        "Jabalpur - Lakhnadon",
        "Tolling, Operation, Maintenance & Transfer of four lane section from Jabalpur to "
        "Lakhnadon section of NH-30 (Km 880.600 to Km 891.780) and NH-34 (Km 1358.000 to "
        "Km 1428.557) in the State of Madhya Pradesh.",
        "NH-30 & NH-34, Madhya Pradesh",
        "880+600 (NH-30) / 1358+000 (NH-34)",
        "891+780 (NH-30) / 1428+557 (NH-34)",
    ),
    (
        "Lakhnadon - Khawasa",
        "Tolling, Operation, Maintenance & Transfer of Lakhnadon-Mohagaon-Khawasa Section of "
        "NH-44 in the State of Madhya Pradesh (Mohagaon-Khawasa Section existing Chainage "
        "624+480 km to 653+770 km, Length of the Section = 29.29 km).",
        "NH-44, Madhya Pradesh",
        "624+480",
        "653+770",
    ),
    (
        "Bokhedi - Kelapur",
        "Tolling, Operation, Maintenance & Transfer of Borkhedi–Wadner–Deodhari from "
        "km 36+600 to km 175+000 of NH-44 section in the State of Maharashtra.",
        "NH-44, Maharashtra",
        "36+600",
        "175+000",
    ),
]


def upgrade() -> None:
    op.add_column("projects", sa.Column("title", sa.String(512), nullable=True))
    conn = op.get_bind()
    for name, title, location, ch_from, ch_to in PACKAGES:
        params = {"n": name, "t": title, "l": location, "f": ch_from, "c": ch_to}
        updated = conn.execute(
            sa.text(
                "UPDATE projects SET title = :t, location = :l, chainage_from = :f, "
                "chainage_to = :c, is_active = true WHERE name = :n"
            ),
            params,
        )
        if updated.rowcount == 0:
            conn.execute(
                sa.text(
                    "INSERT INTO projects (name, title, location, description, chainage_from, "
                    "chainage_to, is_active) VALUES (:n, :t, :l, :d, :f, :c, true)"
                ),
                {**params, "d": f"Corridor stretch folder project: {name}"},
            )
    # Retire the sample project (kept, not deleted, so its issues/invoices/documents survive).
    conn.execute(sa.text("UPDATE projects SET is_active = false WHERE name = 'NH Demo Corridor'"))


def downgrade() -> None:
    op.execute("UPDATE projects SET is_active = true WHERE name = 'NH Demo Corridor'")
    op.drop_column("projects", "title")
