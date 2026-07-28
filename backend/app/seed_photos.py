"""Upload Unsplash road photos to Cloudinary and attach to demo issues.

Run: python -m app.seed_photos
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.enums import IssueStatus
from app.models.issue import Issue, IssueRejection
from app.models.notification import Notification
from app.models.user import User
from app.services.storage import upload_from_url

# Road / infrastructure stock photos (Unsplash CDN + Picsum fallbacks)
UNSPLASH = {
    "before_vms": "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1200&q=80",
    "before_cctv": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80",
    "before_cabinet": "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1200&q=80",
    "before_network": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
    "before_culvert": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80",
    "before_wall": "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=80",
    "after_repair": "https://images.unsplash.com/photo-1581094271901-8022df4466f9?auto=format&fit=crop&w=1200&q=80",
    "after_asphalt": "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1200&q=80",
    "after_site": "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80",
    "final_closed": "https://images.unsplash.com/photo-1464037866556-68135793b5af?auto=format&fit=crop&w=1200&q=80",
    "final_highway": "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=1200&q=80",
    "reject_photo": "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=80",
}

# Reliable fallbacks if Unsplash is blocked for Cloudinary fetch
PICSUM = {
    "before_vms": "https://picsum.photos/seed/roadvms/1200/800",
    "before_cctv": "https://picsum.photos/seed/roadcctv/1200/800",
    "before_cabinet": "https://picsum.photos/seed/roadcab/1200/800",
    "before_network": "https://picsum.photos/seed/roadnet/1200/800",
    "before_culvert": "https://picsum.photos/seed/roadcul/1200/800",
    "before_wall": "https://picsum.photos/seed/roadwall/1200/800",
    "after_repair": "https://picsum.photos/seed/roadfix/1200/800",
    "after_asphalt": "https://picsum.photos/seed/asphalt/1200/800",
    "after_site": "https://picsum.photos/seed/roadsite/1200/800",
    "final_closed": "https://picsum.photos/seed/highway/1200/800",
    "final_highway": "https://picsum.photos/seed/freeway/1200/800",
    "reject_photo": "https://picsum.photos/seed/reject/1200/800",
}


def _up(key: str, prefix: str) -> str:
    """Prefer Cloudinary; fall back to remote Unsplash/Picsum URL for the demo gallery."""
    print(f"  Uploading {key}...")
    for source in (UNSPLASH, PICSUM):
        try:
            url = upload_from_url(source[key], prefix)
            # If upload returned a roadservice cloudinary URL, success
            if "res.cloudinary.com" in url and "/roadservice/" in url:
                return url
            # Remote URL fallback is OK for demo display
            if url.startswith("http"):
                print(f"    Using remote URL for {key}")
                return url
        except Exception as exc:  # noqa: BLE001
            print(f"    failed: {exc}")
    return UNSPLASH[key]


async def main() -> None:
    print("Downloading Unsplash images to Cloudinary...")
    cache: dict[str, str] = {}
    for key in UNSPLASH:
        cache[key] = _up(key, f"seed_{key}")

    async with AsyncSessionLocal() as db:
        issues = (
            await db.execute(select(Issue).options(selectinload(Issue.rejection_history)).order_by(Issue.id))
        ).scalars().all()
        if not issues:
            print("No issues found. Run python -m app.seed first.")
            return

        before_keys = [
            "before_vms",
            "before_cctv",
            "before_cabinet",
            "before_network",
            "before_culvert",
            "before_wall",
        ]
        after_keys = ["after_repair", "after_asphalt", "after_site", "after_repair", "after_asphalt", "after_site"]
        final_keys = ["final_closed", "final_highway"]

        surveyor = (
            await db.execute(select(User).where(User.email == "surveyor@roadservice.app"))
        ).scalar_one_or_none()
        contractor = (
            await db.execute(select(User).where(User.email == "contractor@roadservice.app"))
        ).scalar_one_or_none()
        admin = (await db.execute(select(User).where(User.email == "admin@roadservice.app"))).scalar_one_or_none()

        for idx, issue in enumerate(issues):
            issue.before_photo_path = cache[before_keys[idx % len(before_keys)]]
            if issue.completion_photo_path or issue.status in (
                IssueStatus.COMPLETED,
                IssueStatus.VERIFICATION_PENDING,
                IssueStatus.UNDER_REVIEW,
                IssueStatus.CLOSED,
                IssueStatus.IN_PROGRESS,
            ):
                if issue.status != IssueStatus.OPEN:
                    # in_progress may not have completion yet — only set when already completed-ish
                    if issue.status != IssueStatus.IN_PROGRESS or issue.completion_photo_path:
                        issue.completion_photo_path = cache[after_keys[idx % len(after_keys)]]
            if issue.status in (
                IssueStatus.COMPLETED,
                IssueStatus.VERIFICATION_PENDING,
                IssueStatus.UNDER_REVIEW,
                IssueStatus.CLOSED,
            ):
                issue.completion_photo_path = cache[after_keys[idx % len(after_keys)]]
            if issue.status == IssueStatus.CLOSED:
                issue.verification_photo_path = cache[final_keys[idx % len(final_keys)]]

            if issue.status == IssueStatus.UNDER_REVIEW and surveyor:
                if not issue.rejection_history:
                    db.add(
                        IssueRejection(
                            issue_id=issue.id,
                            reason="Incomplete repair at site",
                            comments="Edges not compacted; please redo and resubmit with clear after photo.",
                            photo_path=cache["reject_photo"],
                            lat=issue.before_lat,
                            lng=issue.before_lng,
                            rejected_by_id=surveyor.id,
                        )
                    )
                else:
                    issue.rejection_history[0].photo_path = cache["reject_photo"]

            print(f"Updated issue #{issue.id} ({issue.status})")

        # Seed sample notifications for demo accounts
        if contractor and surveyor and issues:
            samples = [
                (contractor.id, issues[0].id, "New issue assigned", f"Issue #{issues[0].id} assigned to you."),
                (
                    surveyor.id,
                    next((i.id for i in issues if i.status == IssueStatus.COMPLETED), issues[0].id),
                    "Issue ready for verification",
                    "Contractor submitted work — verify within 24 hours.",
                ),
                (
                    contractor.id,
                    next((i.id for i in issues if i.status == IssueStatus.UNDER_REVIEW), issues[0].id),
                    "Rework required",
                    "Surveyor rejected completion — review comments and resubmit.",
                ),
                (
                    surveyor.id,
                    next(
                        (i.id for i in issues if i.status == IssueStatus.VERIFICATION_PENDING),
                        issues[0].id,
                    ),
                    "Verification due soon",
                    "Verification window is closing for a completed issue.",
                ),
            ]
            if admin:
                samples.append(
                    (
                        admin.id,
                        issues[-1].id,
                        "Issue closed",
                        f"Issue #{issues[-1].id} verified and closed.",
                    )
                )
            for user_id, issue_id, title, message in samples:
                exists = (
                    await db.execute(
                        select(Notification).where(
                            Notification.user_id == user_id,
                            Notification.title == title,
                            Notification.issue_id == issue_id,
                        )
                    )
                ).scalar_one_or_none()
                if not exists:
                    db.add(
                        Notification(
                            user_id=user_id,
                            issue_id=issue_id,
                            title=title,
                            message=message,
                            is_read=False,
                        )
                    )

        await db.commit()
        print("Photo + notification seed complete.")


if __name__ == "__main__":
    asyncio.run(main())
