from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import IssuePriority, IssueStatus, UserRole


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    user_id: int
    full_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    phone: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)
    role: UserRole | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str
    location: str
    description: str | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    contractor_ids: list[int] = []
    surveyor_ids: list[int] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    description: str | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    is_active: bool | None = None
    contractor_ids: list[int] | None = None
    surveyor_ids: list[int] | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    location: str
    description: str | None
    chainage_from: str | None
    chainage_to: str | None
    is_active: bool
    created_at: datetime
    contractors: list[UserOut] = []
    surveyors: list[UserOut] = []


class IssueCreate(BaseModel):
    project_id: int
    issue_type: str
    work_category: str
    description: str
    priority: IssuePriority = IssuePriority.MEDIUM
    chainage: str | None = None
    before_lat: float
    before_lng: float
    deadline_days: int = Field(default=10, ge=1, le=365)
    assigned_contractor_id: int | None = None


class IssueComplete(BaseModel):
    completion_lat: float
    completion_lng: float
    completion_remarks: str | None = None


class IssueVerifyApprove(BaseModel):
    verification_lat: float
    verification_lng: float


class IssueVerifyReject(BaseModel):
    verification_lat: float
    verification_lng: float
    reason: str
    comments: str | None = None


class IssueAdminUpdate(BaseModel):
    assigned_contractor_id: int | None = None
    deadline_days: int | None = Field(default=None, ge=1, le=365)
    priority: IssuePriority | None = None
    status: IssueStatus | None = None


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    from_status: IssueStatus | None
    to_status: IssueStatus
    actor_id: int | None
    note: str | None
    created_at: datetime


class RejectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reason: str
    comments: str | None
    photo_path: str | None
    lat: float | None
    lng: float | None
    rejected_by_id: int
    created_at: datetime


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    issue_type: str
    work_category: str
    issue_type_label: str | None = None
    work_category_label: str | None = None
    description: str
    priority: IssuePriority
    status: IssueStatus
    chainage: str | None
    before_photo_path: str
    before_lat: float
    before_lng: float
    completion_photo_path: str | None
    completion_lat: float | None
    completion_lng: float | None
    completion_remarks: str | None
    completed_at: datetime | None
    verification_photo_path: str | None
    verification_lat: float | None
    verification_lng: float | None
    verified_at: datetime | None
    deadline_days: int
    deadline_date: date
    remaining_days: int | None = None
    reported_by_id: int
    assigned_contractor_id: int
    created_at: datetime
    updated_at: datetime
    status_history: list[StatusHistoryOut] = []
    rejection_history: list[RejectionOut] = []


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    issue_id: int | None
    title: str
    message: str
    is_read: bool
    created_at: datetime


class DashboardStats(BaseModel):
    total_projects: int
    total_issues: int
    by_status: dict[str, int]
    delayed_issues: int
    avg_resolution_days: float | None
    timeline_compliance_pct: float | None
    contractor_performance: list[dict]
    surveyor_performance: list[dict]
