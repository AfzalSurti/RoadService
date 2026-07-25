"""Seed demo users and a sample project. Run: python -m app.seed"""

import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.project import Project
from app.models.user import User

DEMO_USERS = [
    ("admin@roadservice.local", "Admin User", "Admin123!", UserRole.ADMIN),
    ("gov@roadservice.local", "Government Viewer", "Gov123!", UserRole.GOVERNMENT),
    ("contractor@roadservice.local", "Demo Contractor", "Contractor123!", UserRole.CONTRACTOR),
    ("surveyor@roadservice.local", "Demo Surveyor", "Surveyor123!", UserRole.SURVEYOR),
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        for email, name, password, role in DEMO_USERS:
            existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if existing:
                continue
            db.add(
                User(
                    email=email,
                    full_name=name,
                    hashed_password=hash_password(password),
                    role=role,
                    is_active=True,
                )
            )
        await db.commit()

        contractor = (
            await db.execute(select(User).where(User.email == "contractor@roadservice.local"))
        ).scalar_one()
        surveyor = (
            await db.execute(select(User).where(User.email == "surveyor@roadservice.local"))
        ).scalar_one()

        project = (
            await db.execute(select(Project).where(Project.name == "NH Demo Corridor"))
        ).scalar_one_or_none()
        if not project:
            project = Project(
                name="NH Demo Corridor",
                location="Demo Highway Stretch",
                description="Sample project for local development",
                chainage_from="0+000",
                chainage_to="10+000",
                contractors=[contractor],
                surveyors=[surveyor],
            )
            db.add(project)
            await db.commit()
            print("Seeded demo project: NH Demo Corridor")
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
