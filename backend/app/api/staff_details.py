"""Organisation staff details — GMC / NHIPMPL / Contractor key professionals."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.enums import UserRole
from app.models.portal_ops import OrgStaffDetail
from app.models.user import User

router = APIRouter(prefix="/staff-details", tags=["staff-details"])

ORG_BY_ROLE = {
    UserRole.ADMIN: "gmc",
    UserRole.GOVERNMENT: "nhimpl",
    UserRole.CONTRACTOR: "contractor",
}

ORG_LABELS = {
    "gmc": "GMC (HQ + Site) — MIS Expert",
    "nhimpl": "Project Manager NHIMPL / NHIPMPL",
    "contractor": "Contractor",
}


class StaffDetailIn(BaseModel):
    project_name: str = Field(min_length=1, max_length=255)
    position: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    date_of_joining: date
    mobile_no: str = Field(min_length=5, max_length=32)
    alternate_mobile_no: str | None = Field(default=None, max_length=32)
    email_id: str = Field(min_length=3, max_length=255)
    # GMC Experts choose the section (gmc / nhimpl / contractor); others always save to their own.
    organization: str | None = None


class StaffDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    organization: str
    organization_label: str = ""
    project_name: str
    position: str
    name: str
    date_of_joining: date
    mobile_no: str
    alternate_mobile_no: str | None
    email_id: str
    owner_user_id: int
    created_by_id: int
    can_edit: bool = False


def _org_for_user(user: User) -> str | None:
    return ORG_BY_ROLE.get(user.role)


def _can_edit(user: User, row: OrgStaffDetail) -> bool:
    org = _org_for_user(user)
    if user.role == UserRole.ADMIN:
        return True
    if not org or row.organization != org:
        return False
    if user.role == UserRole.ADMIN:
        return True  # GMC Experts maintain all three sections
    if user.role == UserRole.CONTRACTOR:
        return row.owner_user_id == user.id
    # GMC admin / NHIPMPL: any user of that org role can edit their org's staff
    return True


def _target_org(user: User, wanted: str | None) -> str:
    """Section a new / edited row belongs to: GMC Experts may pick any; others their own."""
    if user.role == UserRole.ADMIN and wanted:
        key = _org_key(wanted)
        if not key:
            raise HTTPException(400, "Organisation must be GMC, NHIPMPL or Contractor")
        return key
    org = _org_for_user(user)
    if not org:
        raise HTTPException(403, "Your role cannot add staff details")
    return org


def _org_key(text: str | None) -> str | None:
    t = (text or "").strip().lower()
    if not t:
        return None
    if t in ORG_LABELS:
        return t
    if "nhi" in t or "pmpl" in t or "client" in t or "employer" in t:
        return "nhimpl"
    if "contract" in t or "vendor" in t:
        return "contractor"
    if "gmc" in t or "geo" in t or "consult" in t:
        return "gmc"
    return None


def _out(row: OrgStaffDetail, user: User) -> StaffDetailOut:
    return StaffDetailOut(
        id=row.id,
        organization=row.organization,
        organization_label=ORG_LABELS.get(row.organization, row.organization),
        project_name=row.project_name,
        position=row.position,
        name=row.name,
        date_of_joining=row.date_of_joining,
        mobile_no=row.mobile_no,
        alternate_mobile_no=row.alternate_mobile_no,
        email_id=row.email_id,
        owner_user_id=row.owner_user_id,
        created_by_id=row.created_by_id,
        can_edit=_can_edit(user, row),
    )


@router.get("/meta")
async def staff_meta(
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
):
    org = _org_for_user(user)
    return {
        "my_organization": org,
        "my_organization_label": ORG_LABELS.get(org or "", ""),
        "can_add": org is not None and user.role != UserRole.SURVEYOR,
        # GMC Experts may add to every section and upload one Excel for all.
        "can_add_any": user.role == UserRole.ADMIN,
        "organizations": [{"id": k, "label": v} for k, v in ORG_LABELS.items()],
    }


@router.get("", response_model=list[StaffDetailOut])
async def list_staff(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR, UserRole.SURVEYOR))],
    organization: str | None = None,
):
    stmt = select(OrgStaffDetail).order_by(OrgStaffDetail.organization, OrgStaffDetail.name)
    if organization:
        stmt = stmt.where(OrgStaffDetail.organization == organization)
    rows = (await db.execute(stmt)).scalars().all()
    return [_out(r, user) for r in rows]


@router.post("", response_model=StaffDetailOut, status_code=201)
async def create_staff(
    body: StaffDetailIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    org = _target_org(user, body.organization)
    alt = (body.alternate_mobile_no or "").strip() or None
    row = OrgStaffDetail(
        organization=org,
        project_name=body.project_name.strip(),
        position=body.position.strip(),
        name=body.name.strip(),
        date_of_joining=body.date_of_joining,
        mobile_no=body.mobile_no.strip(),
        alternate_mobile_no=alt,
        email_id=body.email_id.strip().lower(),
        owner_user_id=user.id,
        created_by_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.put("/{staff_id}", response_model=StaffDetailOut)
async def update_staff(
    staff_id: int,
    body: StaffDetailIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    row = (await db.execute(select(OrgStaffDetail).where(OrgStaffDetail.id == staff_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Staff detail not found")
    if not _can_edit(user, row):
        raise HTTPException(403, "You can only edit staff under your own organisation dashboard")
    row.project_name = body.project_name.strip()
    row.position = body.position.strip()
    row.name = body.name.strip()
    row.date_of_joining = body.date_of_joining
    row.mobile_no = body.mobile_no.strip()
    row.alternate_mobile_no = (body.alternate_mobile_no or "").strip() or None
    row.email_id = body.email_id.strip().lower()
    if user.role == UserRole.ADMIN and body.organization:
        row.organization = _target_org(user, body.organization)
    await db.commit()
    await db.refresh(row)
    return _out(row, user)


@router.delete("/{staff_id}")
async def delete_staff(
    staff_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.GOVERNMENT, UserRole.CONTRACTOR))],
):
    row = (await db.execute(select(OrgStaffDetail).where(OrgStaffDetail.id == staff_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Staff detail not found")
    if not _can_edit(user, row):
        raise HTTPException(403, "You can only delete staff under your own organisation dashboard")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


TEMPLATE_COLUMNS = ["Organisation", "Project Name", "Position", "Name", "Date of Joining", "Mobile No",
                    "Alternate Mo No", "Email ID"]


@router.get("/template")
async def staff_template(_: Annotated[User, Depends(require_roles(UserRole.ADMIN))]):
    """Excel for uploading GMC, NHIPMPL and Contractor staff in one go."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation

    wb = Workbook()
    ws = wb.active
    ws.title = "Staff"
    ws.append(TEMPLATE_COLUMNS)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="2F4A8F")
    ws.append(["GMC", "JABALPUR - LAKHNADON", "Team Leader", "Sample Name", "2026-08-01", "9000000000", "", "name@example.com"])
    ws.append(["NHIPMPL", "JABALPUR - LAKHNADON", "Project Manager", "Sample Name", "2026-08-01", "9000000001", "", "pm@example.com"])
    ws.append(["Contractor", "JABALPUR - LAKHNADON", "Site Engineer", "Sample Name", "2026-08-01", "9000000002", "", "site@example.com"])
    dv = DataValidation(type="list", formula1='"GMC,NHIPMPL,Contractor"', allow_blank=False)
    ws.add_data_validation(dv)
    dv.add("A2:A1000")
    for col, width in zip("ABCDEFGH", (14, 30, 28, 24, 16, 14, 16, 30)):
        ws.column_dimensions[col].width = width
    notes = wb.create_sheet("How to fill")
    for line in [
        "One row per person. Organisation: GMC, NHIPMPL or Contractor (or use separate sheets named GMC / NHIPMPL / Contractor).",
        "Date of Joining: DD-MM-YYYY or YYYY-MM-DD. Mobile No and Email ID are required; Alternate Mo No is optional.",
        "Delete the three sample rows before uploading. A person already listed (same section, name and mobile) is updated, not duplicated.",
    ]:
        notes.append([line])
    notes.column_dimensions["A"].width = 120
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="staff_details_template.xlsx"'},
    )


def _parse_date(v) -> date | None:
    from datetime import datetime as _dt

    if isinstance(v, _dt):
        return v.date()
    if isinstance(v, date):
        return v
    t = str(v or "").strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y"):
        try:
            return _dt.strptime(t, fmt).date()
        except ValueError:
            continue
    return None


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


@router.post("/import")
async def import_staff(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    file: UploadFile = File(...),
):
    """GMC Experts: upload GMC, NHIPMPL and Contractor staff from one Excel file. Rows already
    listed (same section, name and mobile) are updated; problems are reported per row."""
    from io import BytesIO

    import openpyxl

    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Upload an Excel file (.xlsx)")
    try:
        wb = openpyxl.load_workbook(BytesIO(await file.read()), data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the workbook: {exc}") from exc

    wanted = {
        "organisation": ("organisation", "organization", "org", "section"),
        "project_name": ("project name", "project"),
        "position": ("position", "designation"),
        "name": ("name", "staff name"),
        "date_of_joining": ("date of joining", "doj", "joining date"),
        "mobile_no": ("mobile no", "mobile", "mobile number", "phone"),
        "alternate_mobile_no": ("alternate mo no", "alternate mobile", "alternate mobile no", "alt mobile"),
        "email_id": ("email id", "email", "e-mail"),
    }
    existing = {
        (r.organization, r.name.strip().lower(), r.mobile_no.strip()): r
        for r in (await db.execute(select(OrgStaffDetail))).scalars().all()
    }
    added = updated = 0
    errors: list[str] = []
    for ws in wb.worksheets:
        sheet_org = _org_key(ws.title)
        rows = list(ws.iter_rows(values_only=True))
        head_i, cols = None, {}
        for i, row in enumerate(rows[:10]):
            labels = [_cell(c).lower() for c in row]
            found = {k: labels.index(a) for k, alts in wanted.items() for a in alts if a in labels}
            if "name" in found and "mobile_no" in found:
                head_i, cols = i, found
                break
        if head_i is None:
            continue  # e.g. the "How to fill" sheet
        for n, row in enumerate(rows[head_i + 1:], start=head_i + 2):
            get = lambda k: _cell(row[cols[k]]) if k in cols and cols[k] < len(row) else ""  # noqa: E731
            if not any(_cell(c) for c in row):
                continue
            where = f"{ws.title} row {n}"
            org = _org_key(get("organisation")) or sheet_org
            name, mobile, email = get("name"), get("mobile_no"), get("email_id").lower()
            doj = _parse_date(row[cols["date_of_joining"]]) if "date_of_joining" in cols and cols["date_of_joining"] < len(row) else None
            missing = [lbl for lbl, v in (("Organisation", org), ("Name", name), ("Mobile No", mobile),
                                          ("Email ID", email), ("Project Name", get("project_name")),
                                          ("Position", get("position")), ("Date of Joining", doj)) if not v]
            if missing:
                errors.append(f"{where}: missing / invalid {', '.join(missing)}")
                continue
            data = dict(project_name=get("project_name")[:255], position=get("position")[:255], name=name[:255],
                        date_of_joining=doj, mobile_no=mobile[:32],
                        alternate_mobile_no=(get("alternate_mobile_no")[:32] or None), email_id=email[:255])
            key = (org, name.lower(), mobile)
            if key in existing:
                for k, v in data.items():
                    setattr(existing[key], k, v)
                updated += 1
            else:
                row_obj = OrgStaffDetail(organization=org, owner_user_id=user.id, created_by_id=user.id, **data)
                db.add(row_obj)
                existing[key] = row_obj
                added += 1
    wb.close()
    if not added and not updated and not errors:
        raise HTTPException(400, "No staff rows found - use the template (Name and Mobile No columns are required)")
    await db.commit()
    return {"added": added, "updated": updated, "errors": errors[:50], "error_count": len(errors)}
