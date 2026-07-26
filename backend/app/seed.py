"""Seed demo users, a sample project, and demo issues. Run: python -m app.seed"""

import asyncio
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.catalog.defects import DEFECT_BY_ID, DEFECT_TYPES
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.enums import IssuePriority, IssueStatus, UserRole
from app.models.issue import Issue, IssueStatusHistory
from app.models.project import Project
from app.models.user import User

DEMO_USERS = [
    ("admin@roadservice.app", "Admin User", "Admin123!", UserRole.ADMIN),
    ("gov@roadservice.app", "Government Viewer", "Gov123!", UserRole.GOVERNMENT),
    ("contractor@roadservice.app", "Demo Contractor", "Contractor123!", UserRole.CONTRACTOR),
    ("surveyor@roadservice.app", "Demo Surveyor", "Surveyor123!", UserRole.SURVEYOR),
]

EMAIL_ALIASES = {
    "admin@roadservice.local": "admin@roadservice.app",
    "gov@roadservice.local": "gov@roadservice.app",
    "contractor@roadservice.local": "contractor@roadservice.app",
    "surveyor@roadservice.local": "surveyor@roadservice.app",
}

PHOTO = "https://res.cloudinary.com/demo/image/upload/sample.jpg"

# Spread around Ahmedabad corridor for the map view
DEMO_ISSUES = [
    {
        "issue_type": "ATMS-1",
        "work_category": "ATMS",
        "description": "VMS board at km 42 not displaying traffic advisories. Blank since morning patrol.",
        "priority": IssuePriority.HIGH,
        "status": IssueStatus.OPEN,
        "chainage": "42+150",
        "lat": 22.9734,
        "lng": 72.5208,
        "deadline_days": 7,
    },
    {
        "issue_type": "ATMS-5",
        "work_category": "ATMS",
        "description": "CCTV camera near toll plaza offline — no live feed at OCC.",
        "priority": IssuePriority.CRITICAL,
        "status": IssueStatus.IN_PROGRESS,
        "chainage": "38+020",
        "lat": 22.8512,
        "lng": 72.6101,
        "deadline_days": 5,
    },
    {
        "issue_type": "ATMS-19",
        "work_category": "TOLL_ATMS",
        "description": "Controller cabinet door found open/damaged during night inspection.",
        "priority": IssuePriority.HIGH,
        "status": IssueStatus.COMPLETED,
        "chainage": "40+500",
        "lat": 22.9105,
        "lng": 72.5650,
        "deadline_days": 10,
        "completed": True,
    },
    {
        "issue_type": "S1",
        "work_category": "SAFETY",
        "description": "Communication network failure between field devices and control room.",
        "priority": IssuePriority.CRITICAL,
        "status": IssueStatus.VERIFICATION_PENDING,
        "chainage": "45+800",
        "lat": 23.0225,
        "lng": 72.5714,
        "deadline_days": 3,
        "completed": True,
        "completed_hours_ago": 30,
    },
    {
        "issue_type": "S",
        "work_category": "STRUCTURE",
        "description": "Scour observed at culvert foundation after heavy rain. Needs structural check.",
        "priority": IssuePriority.MEDIUM,
        "status": IssueStatus.UNDER_REVIEW,
        "chainage": "35+210",
        "lat": 22.7800,
        "lng": 72.6800,
        "deadline_days": 14,
        "completed": True,
    },
    {
        "issue_type": "T3",
        "work_category": "RETAINING_WALL",
        "description": "Retaining wall tilting near embankment — repaired and verified closed.",
        "priority": IssuePriority.HIGH,
        "status": IssueStatus.CLOSED,
        "chainage": "48+000",
        "lat": 23.0801,
        "lng": 72.5402,
        "deadline_days": 12,
        "completed": True,
        "verified": True,
    },
]


def _resolve(type_id: str, category_id: str) -> tuple[str, str]:
    if type_id in DEFECT_BY_ID:
        d = DEFECT_BY_ID[type_id]
        return d.id, d.category_id
    for d in DEFECT_TYPES:
        if d.category_id == category_id:
            return d.id, d.category_id
    return type_id, category_id


async def _seed_demo_issues(db, project: Project, surveyor: User, contractor: User) -> int:
    existing = (await db.execute(select(func.count(Issue.id)))).scalar_one()
    if existing > 0:
        print(f"Issues already present ({existing}); skipping demo issue seed.")
        return 0

    created = 0
    now = datetime.now(timezone.utc)
    for item in DEMO_ISSUES:
        type_id, cat_id = _resolve(item["issue_type"], item["work_category"])
        deadline = date.today() + timedelta(days=item["deadline_days"])
        issue = Issue(
            project_id=project.id,
            issue_type=type_id,
            work_category=cat_id,
            description=item["description"],
            priority=item["priority"],
            status=IssueStatus.OPEN,
            chainage=item["chainage"],
            before_photo_path=PHOTO,
            before_lat=item["lat"],
            before_lng=item["lng"],
            deadline_days=item["deadline_days"],
            deadline_date=deadline,
            reported_by_id=surveyor.id,
            assigned_contractor_id=contractor.id,
        )
        db.add(issue)
        await db.flush()

        history: list[IssueStatusHistory] = [
            IssueStatusHistory(
                issue_id=issue.id,
                from_status=None,
                to_status=IssueStatus.OPEN,
                actor_id=surveyor.id,
                note="Demo issue created",
            )
        ]
        target = item["status"]

        if target != IssueStatus.OPEN:
            history.append(
                IssueStatusHistory(
                    issue_id=issue.id,
                    from_status=IssueStatus.OPEN,
                    to_status=IssueStatus.IN_PROGRESS,
                    actor_id=contractor.id,
                    note="Work started",
                )
            )
            issue.status = IssueStatus.IN_PROGRESS

        if item.get("completed") or target in (
            IssueStatus.COMPLETED,
            IssueStatus.VERIFICATION_PENDING,
            IssueStatus.UNDER_REVIEW,
            IssueStatus.CLOSED,
        ):
            hours_ago = item.get("completed_hours_ago", 6)
            issue.completion_photo_path = PHOTO
            issue.completion_lat = item["lat"] + 0.0002
            issue.completion_lng = item["lng"] + 0.0002
            issue.completion_remarks = "Demo completion remarks"
            issue.completed_at = now - timedelta(hours=hours_ago)
            history.append(
                IssueStatusHistory(
                    issue_id=issue.id,
                    from_status=IssueStatus.IN_PROGRESS,
                    to_status=IssueStatus.COMPLETED,
                    actor_id=contractor.id,
                    note="Work completed — pending verification",
                )
            )
            issue.status = IssueStatus.COMPLETED

        if target == IssueStatus.VERIFICATION_PENDING:
            history.append(
                IssueStatusHistory(
                    issue_id=issue.id,
                    from_status=IssueStatus.COMPLETED,
                    to_status=IssueStatus.VERIFICATION_PENDING,
                    actor_id=None,
                    note="Auto-transition after 24h without verification (demo)",
                )
            )
            issue.status = IssueStatus.VERIFICATION_PENDING

        if target == IssueStatus.UNDER_REVIEW:
            history.append(
                IssueStatusHistory(
                    issue_id=issue.id,
                    from_status=IssueStatus.COMPLETED,
                    to_status=IssueStatus.UNDER_REVIEW,
                    actor_id=surveyor.id,
                    note="Rework required: incomplete repair at site",
                )
            )
            issue.status = IssueStatus.UNDER_REVIEW

        if target == IssueStatus.CLOSED or item.get("verified"):
            issue.verification_photo_path = PHOTO
            issue.verification_lat = item["lat"]
            issue.verification_lng = item["lng"]
            issue.verified_at = now - timedelta(hours=1)
            history.append(
                IssueStatusHistory(
                    issue_id=issue.id,
                    from_status=IssueStatus.COMPLETED,
                    to_status=IssueStatus.CLOSED,
                    actor_id=surveyor.id,
                    note="Verification approved",
                )
            )
            issue.status = IssueStatus.CLOSED

        if target == IssueStatus.IN_PROGRESS:
            issue.status = IssueStatus.IN_PROGRESS

        for h in history:
            db.add(h)
        created += 1

    await db.commit()
    return created


async def main() -> None:
    async with AsyncSessionLocal() as db:
        for old_email, new_email in EMAIL_ALIASES.items():
            user = (await db.execute(select(User).where(User.email == old_email))).scalar_one_or_none()
            if user:
                user.email = new_email

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
            await db.execute(select(User).where(User.email == "contractor@roadservice.app"))
        ).scalar_one()
        surveyor = (
            await db.execute(select(User).where(User.email == "surveyor@roadservice.app"))
        ).scalar_one()

        project = (
            await db.execute(
                select(Project)
                .where(Project.name == "NH Demo Corridor")
                .options(selectinload(Project.contractors), selectinload(Project.surveyors))
            )
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
            project = (
                await db.execute(
                    select(Project)
                    .where(Project.name == "NH Demo Corridor")
                    .options(selectinload(Project.contractors), selectinload(Project.surveyors))
                )
            ).scalar_one()
            print("Seeded demo project: NH Demo Corridor")
        else:
            contractor_ids = {u.id for u in project.contractors}
            surveyor_ids = {u.id for u in project.surveyors}
            if contractor.id not in contractor_ids:
                project.contractors.append(contractor)
            if surveyor.id not in surveyor_ids:
                project.surveyors.append(surveyor)
            await db.commit()

        n = await _seed_demo_issues(db, project, surveyor, contractor)
        if n:
            print(f"Seeded {n} demo issues.")
        print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
