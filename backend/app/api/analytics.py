from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.billing import Invoice, PortalDocument, Vendor
from app.models.enums import IssuePriority, IssueStatus
from app.models.issue import Issue
from app.models.project import Project
from app.models.rate import QuantityEntry, RateItem
from app.models.user import User
from app.schemas import DashboardStats
from app.services.issue_service import remaining_days

router = APIRouter(prefix="/analytics", tags=["analytics"])

ISSUE_HEADERS = [
    "ID",
    "Project",
    "Type",
    "Category",
    "Priority",
    "Status",
    "Chainage",
    "Deadline",
    "Remaining Days",
    "Reporter",
    "Contractor",
    "Created",
]


def _status_key(status: object) -> str:
    return status.value if hasattr(status, "value") else str(status)


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
    project_id: int | None = None,
    contractor_id: int | None = None,
):
    """KPIs for a project, optionally narrowed to one contractor (a vendor's login):
    their assigned issues, submitted invoices, uploaded documents and BOQ quantities."""
    total_projects = (await db.execute(select(func.count(Project.id)))).scalar_one()

    issue_filter = []
    if project_id is not None:
        issue_filter.append(Issue.project_id == project_id)
    if contractor_id is not None:
        issue_filter.append(Issue.assigned_contractor_id == contractor_id)

    total_issues = (
        await db.execute(select(func.count(Issue.id)).where(*issue_filter))
    ).scalar_one()

    status_stmt = select(Issue.status, func.count(Issue.id)).where(*issue_filter).group_by(Issue.status)
    status_rows = (await db.execute(status_stmt)).all()
    by_status = {s.value: 0 for s in IssueStatus}
    for status, count in status_rows:
        by_status[_status_key(status)] = count

    # Only load columns needed for KPIs — avoids 500 if newer issue columns
    # (lane/side/etc.) are not migrated on the remote DB yet.
    issue_stmt = select(Issue).options(
        load_only(
            Issue.id,
            Issue.status,
            Issue.deadline_date,
            Issue.verified_at,
            Issue.created_at,
            Issue.assigned_contractor_id,
            Issue.reported_by_id,
            Issue.project_id,
        )
    )
    issue_stmt = issue_stmt.where(*issue_filter)
    issues = (await db.execute(issue_stmt)).scalars().all()
    delayed = sum(
        1 for i in issues if remaining_days(i.deadline_date) < 0 and i.status != IssueStatus.CLOSED
    )

    closed = [i for i in issues if i.status == IssueStatus.CLOSED and i.verified_at and i.created_at]
    avg_resolution = None
    if closed:
        days = [(i.verified_at.date() - i.created_at.date()).days for i in closed]
        avg_resolution = round(sum(days) / len(days), 2)

    on_time = sum(
        1
        for i in closed
        if i.verified_at and i.deadline_date and i.verified_at.date() <= i.deadline_date
    )
    compliance = round((on_time / len(closed)) * 100, 1) if closed else None

    contractor_stmt = select(
        Issue.assigned_contractor_id,
        func.count(Issue.id),
        func.sum(case((Issue.status == IssueStatus.CLOSED, 1), else_=0)),
    ).where(*issue_filter).group_by(Issue.assigned_contractor_id)
    contractor_rows = (await db.execute(contractor_stmt)).all()
    contractor_performance = [
        {"contractor_id": cid, "total": total, "closed": int(closed_n or 0)}
        for cid, total, closed_n in contractor_rows
    ]

    surveyor_stmt = (
        select(Issue.reported_by_id, func.count(Issue.id)).where(*issue_filter).group_by(Issue.reported_by_id)
    )
    surveyor_rows = (await db.execute(surveyor_stmt)).all()
    surveyor_performance = [{"surveyor_id": sid, "reported": count} for sid, count in surveyor_rows]

    total_invoices = 0
    invoices_by_status: dict[str, int] = {}
    total_documents = 0
    total_vendors = 0
    boq_total = 0.0
    exec_total = 0.0
    try:
        inv_filter = []
        if project_id is not None:
            inv_filter.append(Invoice.project_id == project_id)
        if contractor_id is not None:
            inv_filter.append(Invoice.submitted_by_id == contractor_id)
        total_invoices = (await db.execute(select(func.count(Invoice.id)).where(*inv_filter))).scalar_one()
        inv_status_stmt = (
            select(Invoice.status, func.count(Invoice.id)).where(*inv_filter).group_by(Invoice.status)
        )
        inv_rows = (await db.execute(inv_status_stmt)).all()
        invoices_by_status = {_status_key(s): c for s, c in inv_rows}

        doc_stmt = select(func.count(PortalDocument.id))
        if project_id is not None:
            doc_stmt = doc_stmt.where(PortalDocument.project_id == project_id)
        if contractor_id is not None:
            doc_stmt = doc_stmt.where(PortalDocument.uploaded_by_id == contractor_id)
        total_documents = (await db.execute(doc_stmt)).scalar_one()

        vendor_stmt = select(func.count(Vendor.id))
        if project_id is not None:
            vendor_stmt = vendor_stmt.where(
                (Vendor.project_id == project_id) | (Vendor.project_id.is_(None))
            )
        if contractor_id is not None:
            vendor_stmt = vendor_stmt.where(Vendor.contractor_user_id == contractor_id)
        total_vendors = (await db.execute(vendor_stmt)).scalar_one()

        rate_filter = []
        if project_id is not None:
            rate_filter.append(RateItem.project_id == project_id)
        boq_total = float(
            (
                await db.execute(
                    select(func.coalesce(func.sum(RateItem.boq_amount), 0)).where(*rate_filter)
                )
            ).scalar_one()
            or 0
        )
        if contractor_id is not None:
            # Executed value this contractor recorded against the package BOQ.
            qty_filter = [QuantityEntry.entered_by_id == contractor_id]
            if project_id is not None:
                qty_filter.append(QuantityEntry.project_id == project_id)
            exec_stmt = select(func.coalesce(func.sum(QuantityEntry.amount), 0)).where(*qty_filter)
        else:
            exec_stmt = select(func.coalesce(func.sum(RateItem.executed_amount), 0)).where(*rate_filter)
        exec_total = float((await db.execute(exec_stmt)).scalar_one() or 0)
    except Exception:
        # Portal tables / columns may lag behind code on free deploys — keep core KPIs working.
        await db.rollback()

    return DashboardStats(
        total_projects=1 if project_id is not None else total_projects,
        total_issues=total_issues,
        by_status=by_status,
        delayed_issues=delayed,
        avg_resolution_days=avg_resolution,
        timeline_compliance_pct=compliance,
        contractor_performance=contractor_performance,
        surveyor_performance=surveyor_performance,
        total_invoices=total_invoices,
        invoices_by_status=invoices_by_status,
        total_documents=total_documents,
        total_vendors=total_vendors,
        total_boq_amount=boq_total,
        total_executed_amount=exec_total,
    )


@router.get("/export/excel")
async def export_excel(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
    project_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    package_name: str | None = None,
    report_title: str | None = None,
    prepared_by: str | None = None,
    remarks: str | None = None,
    period_type: str | None = None,
):
    today = date.today()
    period = (period_type or "custom").strip().lower()
    if period == "daily":
        date_from = today
        date_to = today
        if not report_title:
            report_title = f"Daily Issues Report — {today.isoformat()}"
    elif period == "weekly":
        # Monday–Sunday of current week (ISO)
        date_from = today - timedelta(days=today.weekday())
        date_to = date_from + timedelta(days=6)
        if not report_title:
            report_title = f"Weekly Issues Report — {date_from.isoformat()} to {date_to.isoformat()}"
    else:
        period = "custom"

    stmt = select(Issue).order_by(Issue.id)
    if project_id is not None:
        stmt = stmt.where(Issue.project_id == project_id)
    if date_from is not None:
        stmt = stmt.where(Issue.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        stmt = stmt.where(Issue.created_at <= datetime.combine(date_to, datetime.max.time()))
    issues = (await db.execute(stmt)).scalars().all()

    project_name = ""
    if project_id is not None:
        proj = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
        project_name = proj.name if proj else str(project_id)

    wb = Workbook()
    meta = wb.active
    meta.title = "Report Details"
    meta.append(["Field", "Value"])
    meta.append(["Report Type", period.title()])
    meta.append(["Report Title", report_title or "RoadService Issues Report"])
    meta.append(["Project ID", project_id or ""])
    meta.append(["Project Name", project_name])
    meta.append(["Package / Stretch", package_name or ""])
    meta.append(["Period From", date_from.isoformat() if date_from else ""])
    meta.append(["Period To", date_to.isoformat() if date_to else ""])
    meta.append(["Prepared By", prepared_by or ""])
    meta.append(["Remarks", remarks or ""])
    meta.append(["Generated On", today.isoformat()])
    meta.append(["Row Count", len(issues)])

    # Summary sheet for daily/weekly MIS
    summary = wb.create_sheet("Summary")
    summary.append(["Status", "Count"])
    status_counts: dict[str, int] = {}
    for i in issues:
        key = i.status.value if hasattr(i.status, "value") else str(i.status)
        status_counts[key] = status_counts.get(key, 0) + 1
    for k, v in sorted(status_counts.items()):
        summary.append([k, v])
    summary.append([])
    summary.append(["Total issues", len(issues)])
    delayed = sum(
        1
        for i in issues
        if i.deadline_date and remaining_days(i.deadline_date) < 0 and (i.status.value if hasattr(i.status, "value") else str(i.status)) != "closed"
    )
    summary.append(["Delayed (open)", delayed])

    ws = wb.create_sheet("Issues")
    ws.append(ISSUE_HEADERS)
    for i in issues:
        ws.append(
            [
                i.id,
                i.project_id,
                i.issue_type,
                i.work_category,
                i.priority.value if hasattr(i.priority, "value") else i.priority,
                i.status.value if hasattr(i.status, "value") else i.status,
                i.chainage,
                i.deadline_date.isoformat() if i.deadline_date else "",
                remaining_days(i.deadline_date) if i.deadline_date else "",
                i.reported_by_id,
                i.assigned_contractor_id,
                i.created_at.isoformat() if i.created_at else "",
            ]
        )

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    suffix = period if period != "custom" else today.isoformat()
    fname = f"roadservice_{period}_report_{suffix}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/import/excel")
async def import_excel(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an Excel .xlsx file")
    raw = await file.read()
    try:
        wb = load_workbook(BytesIO(raw), data_only=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {exc}") from exc

    ws = wb["Issues"] if "Issues" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Excel sheet is empty")

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(headers)}
    required = ["ID", "Status", "Priority"]
    missing = [h for h in required if h not in idx]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Excel must include columns: {', '.join(required)}. Missing: {', '.join(missing)}",
        )

    updated = 0
    skipped = 0
    errors: list[str] = []
    for row_no, row in enumerate(rows[1:], start=2):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue
        try:
            issue_id = int(row[idx["ID"]])
        except (TypeError, ValueError):
            skipped += 1
            errors.append(f"Row {row_no}: invalid ID")
            continue
        issue = (await db.execute(select(Issue).where(Issue.id == issue_id))).scalar_one_or_none()
        if not issue:
            skipped += 1
            errors.append(f"Row {row_no}: issue #{issue_id} not found")
            continue

        status_raw = str(row[idx["Status"]] or "").strip().lower().replace(" ", "_")
        priority_raw = str(row[idx["Priority"]] or "").strip().lower()
        try:
            if status_raw:
                issue.status = IssueStatus(status_raw)
            if priority_raw:
                issue.priority = IssuePriority(priority_raw)
        except ValueError as exc:
            skipped += 1
            errors.append(f"Row {row_no}: {exc}")
            continue

        if "Type" in idx and row[idx["Type"]]:
            issue.issue_type = str(row[idx["Type"]]).strip()
        if "Category" in idx and row[idx["Category"]]:
            issue.work_category = str(row[idx["Category"]]).strip()
        if "Chainage" in idx and row[idx["Chainage"]] is not None:
            issue.chainage = str(row[idx["Chainage"]]).strip()
        updated += 1

    await db.commit()
    return {
        "ok": True,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:20],
        "imported_by": user.full_name,
        "filename": file.filename,
    }


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
        data.append([str(i.id), i.issue_type, i.status.value, i.priority.value, i.deadline_date.isoformat()])
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


@router.get("/monthly")
async def monthly_report(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    month: str,
    project_id: int | None = None,
):
    """Monthly report: defects (raised / closed / time to close, by contractor), bills and work
    done (by vendor), contractor-wise summary and attendance by person, for one month (YYYY-MM)."""
    from sqlalchemy import text as sql_text
    from sqlalchemy.orm import selectinload

    from app.models.enums import UserRole
    from app.models.portal_ops import AttendanceRecord, Personnel

    if user.role not in (UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR):
        raise HTTPException(status_code=403, detail="Not allowed")
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM") from exc
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)

    names = {p.id: p.name for p in (await db.execute(select(Project))).scalars().all()}
    users = {u.id: u.full_name for u in (await db.execute(select(User))).scalars().all()}

    # ---- Defects ----
    stmt = select(Issue).options(selectinload(Issue.status_history))
    if project_id:
        stmt = stmt.where(Issue.project_id == project_id)
    if user.role == UserRole.CONTRACTOR:
        stmt = stmt.where(Issue.assigned_contractor_id == user.id)
    issues = (await db.execute(stmt)).scalars().all()
    raised = closed = open_end = 0
    close_hours: list[float] = []
    by_contractor: dict[str, dict] = {}
    for i in issues:
        made = i.created_at.date()
        closed_at = next((h.created_at for h in i.status_history if h.to_status == IssueStatus.CLOSED), None)
        if closed_at is None and i.status == IssueStatus.CLOSED:
            closed_at = i.verified_at or i.updated_at
        name = users.get(i.assigned_contractor_id, f"User #{i.assigned_contractor_id}")
        row = by_contractor.setdefault(name, {"contractor": name, "raised": 0, "closed": 0, "open_at_month_end": 0})
        if start <= made < end:
            raised += 1
            row["raised"] += 1
        if closed_at and start <= closed_at.date() < end:
            closed += 1
            row["closed"] += 1
            close_hours.append((closed_at - i.created_at).total_seconds() / 3600)
        if made < end and not (closed_at and closed_at.date() < end):
            open_end += 1
            row["open_at_month_end"] += 1
    defects = {
        "raised": raised,
        "closed": closed,
        "open_at_month_end": open_end,
        "avg_days_to_close": round(sum(close_hours) / len(close_hours) / 24, 1) if close_hours else None,
        "by_contractor": sorted(
            [r for r in by_contractor.values() if r["raised"] or r["closed"] or r["open_at_month_end"]],
            key=lambda r: r["contractor"],
        ),
    }

    # ---- Bills and work done (BOQ quantity entries in the month) ----
    vendors = {v.id: v for v in (await db.execute(select(Vendor))).scalars().all()}
    day = func.coalesce(QuantityEntry.bill_date, func.date(QuantityEntry.created_at))
    q = select(QuantityEntry).where(day >= start, day < end)
    if project_id:
        q = q.where(QuantityEntry.project_id == project_id)
    entries = (await db.execute(q)).scalars().all()
    if user.role == UserRole.CONTRACTOR:
        mine = {v.id for v in vendors.values() if v.contractor_user_id == user.id}
        entries = [e for e in entries if e.vendor_id in mine]
    bills: dict[tuple, dict] = {}
    by_vendor: dict[int | None, dict] = {}
    for e in entries:
        v = vendors.get(e.vendor_id)
        vname = v.name if v else "No vendor"
        vrow = by_vendor.setdefault(
            e.vendor_id,
            {"vendor": vname, "package": names.get(e.project_id, ""), "work_done": 0.0, "bills": 0, "entries": 0},
        )
        vrow["work_done"] += float(e.amount or 0)
        vrow["entries"] += 1
        if e.bill_no:
            key = (e.vendor_id, e.bill_no)
            if key not in bills:
                bills[key] = {
                    "bill_no": e.bill_no,
                    "vendor": vname,
                    "package": names.get(e.project_id, ""),
                    "bill_date": e.bill_date.isoformat() if e.bill_date else None,
                    "amount": 0.0,
                    "items": 0,
                }
                vrow["bills"] += 1
            bills[key]["amount"] += float(e.amount or 0)
            bills[key]["items"] += 1
    cancelled = 0
    exists = (await db.execute(sql_text("SELECT to_regclass('public.vendor_bill_records')"))).scalar()
    if exists:
        cq = "SELECT count(*) FROM vendor_bill_records WHERE kind = 'cancelled' AND created_at >= :s AND created_at < :e"
        params: dict = {"s": start, "e": end}
        if project_id:
            cq += " AND project_id = :p"
            params["p"] = project_id
        cancelled = int((await db.execute(sql_text(cq), params)).scalar() or 0)

    # ---- Contractor-wise (vendor) progress to date ----
    items_q = select(RateItem)
    if project_id:
        items_q = items_q.where(RateItem.project_id == project_id)
    agg: dict[int, dict] = {}
    for it in (await db.execute(items_q)).scalars().all():
        if it.vendor_id is None:
            continue
        a = agg.setdefault(it.vendor_id, {"boq": 0.0, "done": 0.0})
        a["boq"] += float(it.boq_amount or 0)
        a["done"] += float(it.executed_amount or 0)
    contractors = []
    for vid, a in agg.items():
        v = vendors.get(vid)
        if not v or (user.role == UserRole.CONTRACTOR and v.contractor_user_id != user.id):
            continue
        contractors.append(
            {
                "vendor": v.name,
                "package": names.get(v.project_id, ""),
                "contract_value": round(a["boq"], 2),
                "work_done_this_month": round(by_vendor.get(vid, {}).get("work_done", 0.0), 2),
                "work_done_to_date": round(a["done"], 2),
                "progress_pct": round(a["done"] / a["boq"] * 100, 1) if a["boq"] else None,
            }
        )
    contractors.sort(key=lambda r: r["contract_value"], reverse=True)

    # ---- Attendance by person ----
    attendance: dict[int, dict] = {}
    if user.role != UserRole.CONTRACTOR:
        att_q = (
            select(AttendanceRecord, Personnel)
            .join(Personnel, Personnel.id == AttendanceRecord.personnel_id)
            .where(AttendanceRecord.work_date >= start, AttendanceRecord.work_date < end)
        )
        if project_id:
            att_q = att_q.where(Personnel.project_id == project_id)
        for rec, person in (await db.execute(att_q)).all():
            row = attendance.setdefault(
                person.id,
                {
                    "person": person.full_name,
                    "designation": person.designation,
                    "employer": person.employer,
                    "present": 0,
                    "absent": 0,
                    "leave": 0,
                    "on_tour": 0,
                    "hours": 0.0,
                },
            )
            status = (rec.status or "present").lower()
            row[status if status in ("present", "absent", "leave", "on_tour") else "present"] += 1
            row["hours"] += float(rec.working_hours or 0)

    return {
        "month": start.strftime("%Y-%m"),
        "package": names.get(project_id, "All packages") if project_id else "All packages",
        "defects": defects,
        "bills": {
            "count": len(bills),
            "amount": round(sum(b["amount"] for b in bills.values()), 2),
            "cancelled": cancelled,
            "rows": sorted(bills.values(), key=lambda b: (b["bill_date"] or "", b["bill_no"])),
        },
        "work": {
            "amount": round(sum(r["work_done"] for r in by_vendor.values()), 2),
            "rows": sorted(
                [{**r, "work_done": round(r["work_done"], 2)} for r in by_vendor.values()],
                key=lambda r: r["work_done"],
                reverse=True,
            ),
        },
        "contractors": contractors,
        "attendance": sorted(attendance.values(), key=lambda r: r["person"]),
    }
