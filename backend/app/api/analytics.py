from datetime import date
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.enums import IssueStatus
from app.models.issue import Issue
from app.models.project import Project
from app.models.user import User
from app.schemas import DashboardStats
from app.services.issue_service import remaining_days

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    total_projects = (await db.execute(select(func.count(Project.id)))).scalar_one()
    total_issues = (await db.execute(select(func.count(Issue.id)))).scalar_one()

    status_rows = (
        await db.execute(select(Issue.status, func.count(Issue.id)).group_by(Issue.status))
    ).all()
    by_status = {s.value if hasattr(s, "value") else str(s): 0 for s in IssueStatus}
    for status, count in status_rows:
        by_status[status.value] = count

    issues = (await db.execute(select(Issue))).scalars().all()
    delayed = sum(1 for i in issues if remaining_days(i.deadline_date) < 0 and i.status != IssueStatus.CLOSED)

    closed = [i for i in issues if i.status == IssueStatus.CLOSED and i.verified_at and i.created_at]
    avg_resolution = None
    if closed:
        days = [(i.verified_at.date() - i.created_at.date()).days for i in closed]
        avg_resolution = round(sum(days) / len(days), 2)

    on_time = sum(1 for i in closed if i.verified_at and i.verified_at.date() <= i.deadline_date)
    compliance = round((on_time / len(closed)) * 100, 1) if closed else None

    contractor_rows = (
        await db.execute(
            select(
                Issue.assigned_contractor_id,
                func.count(Issue.id),
                func.sum(case((Issue.status == IssueStatus.CLOSED, 1), else_=0)),
            ).group_by(Issue.assigned_contractor_id)
        )
    ).all()
    contractor_performance = [
        {"contractor_id": cid, "total": total, "closed": int(closed_n or 0)}
        for cid, total, closed_n in contractor_rows
    ]

    surveyor_rows = (
        await db.execute(
            select(Issue.reported_by_id, func.count(Issue.id)).group_by(Issue.reported_by_id)
        )
    ).all()
    surveyor_performance = [{"surveyor_id": sid, "reported": count} for sid, count in surveyor_rows]

    return DashboardStats(
        total_projects=total_projects,
        total_issues=total_issues,
        by_status=by_status,
        delayed_issues=delayed,
        avg_resolution_days=avg_resolution,
        timeline_compliance_pct=compliance,
        contractor_performance=contractor_performance,
        surveyor_performance=surveyor_performance,
    )


@router.get("/export/excel")
async def export_excel(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    issues = (
        await db.execute(select(Issue).order_by(Issue.id))
    ).scalars().all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Issues"
    headers = [
        "ID", "Project", "Type", "Category", "Priority", "Status", "Chainage",
        "Deadline", "Remaining Days", "Reporter", "Contractor", "Created",
    ]
    ws.append(headers)
    for i in issues:
        ws.append([
            i.id,
            i.project_id,
            i.issue_type.value,
            i.work_category.value,
            i.priority.value,
            i.status.value,
            i.chainage,
            i.deadline_date.isoformat(),
            remaining_days(i.deadline_date),
            i.reported_by_id,
            i.assigned_contractor_id,
            i.created_at.isoformat() if i.created_at else "",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="issues_{date.today()}.xlsx"'},
    )


@router.get("/export/pdf")
async def export_pdf(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
    issues = (await db.execute(select(Issue).order_by(Issue.id).limit(200))).scalars().all()
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Road Issue Management — Issues Report", styles["Title"]),
        Spacer(1, 12),
        Paragraph(f"Generated: {date.today().isoformat()}", styles["Normal"]),
        Spacer(1, 18),
    ]
    data = [["ID", "Type", "Status", "Priority", "Deadline"]]
    for i in issues:
        data.append([str(i.id), i.issue_type.value, i.status.value, i.priority.value, i.deadline_date.isoformat()])
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
        ])
    )
    story.append(table)
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="issues_{date.today()}.pdf"'},
    )
