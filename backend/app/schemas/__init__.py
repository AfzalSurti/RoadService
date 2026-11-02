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
    mfa_pin: str | None = None


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
    mfa_enabled: bool = False


class ProjectCreate(BaseModel):
    name: str
    title: str | None = None
    short_name: str | None = None
    location: str
    description: str | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    contractor_ids: list[int] = []
    surveyor_ids: list[int] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    short_name: str | None = None
    location: str | None = None
    description: str | None = None
    chainage_from: str | None = None
    chainage_to: str | None = None
    is_active: bool | None = None
    contractor_ids: list[int] | None = None
    surveyor_ids: list[int] | None = None


class InventoryItemIn(BaseModel):
    scope: str
    description: str = ""


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    sort_order: int
    scope: str
    description: str


class InventorySheetSummary(BaseModel):
    id: int
    name: str
    sort_order: int
    rows: int
    cols: int


class InventorySheetOut(InventorySheetSummary):
    grid: list[list[str]]
    merges: list[list[int]]


class InventorySheetIn(BaseModel):
    name: str | None = None
    grid: list[list[str]]
    merges: list[list[int]] = []


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    title: str | None = None
    short_name: str | None = None
    image_url: str | None = None
    location_map_url: str | None = None
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
    lane: str | None = None
    side: str | None = None
    carriageway: str | None = None
    is_critical: bool = False
    start_chainage: str | None = None
    end_chainage: str | None = None
    voice_note: str | None = None
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
    link: str | None = None
    title: str
    message: str
    is_read: bool
    created_at: datetime


class RateItemCreate(BaseModel):
    project_id: int
    vendor_id: int | None = None
    item_no: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=2)
    unit: str = Field(min_length=1, max_length=32)
    boq_quantity: float = Field(gt=0)
    rate: float = Field(ge=0)
    # Quantity already completed (billed) when the item is entered; amount = qty x rate.
    completed_quantity: float = Field(default=0, ge=0)
    remarks: str | None = None


class RateItemUpdate(BaseModel):
    vendor_id: int | None = None
    completed_quantity: float | None = Field(default=None, ge=0)
    item_no: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, min_length=2)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    boq_quantity: float | None = Field(default=None, gt=0)
    rate: float | None = Field(default=None, ge=0)
    remarks: str | None = None


class RateItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    vendor_id: int | None = None
    item_no: str
    description: str
    unit: str
    boq_quantity: float
    rate: float
    boq_amount: float
    executed_quantity: float
    executed_amount: float
    remaining_quantity: float = 0
    remaining_amount: float = 0
    progress_pct: float | None = None
    remarks: str | None
    created_at: datetime
    updated_at: datetime


class RateItemSurveyorOut(BaseModel):
    """Surveyor view — no rate / money fields."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    item_no: str
    description: str
    unit: str
    executed_quantity: float


class QuantityEntryCreate(BaseModel):
    quantity: float = Field(gt=0)
    note: str | None = None


class QuantityEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rate_item_id: int
    project_id: int
    quantity: float
    amount: float
    entered_by_id: int
    note: str | None
    vendor_id: int | None = None
    bill_no: str | None = None
    bill_date: date | None = None
    created_at: datetime


class VendorBillLineIn(BaseModel):
    rate_item_id: int
    quantity: float = Field(gt=0)


class VendorBillIn(BaseModel):
    project_id: int
    vendor_id: int
    bill_no: str = Field(min_length=1, max_length=64)
    bill_date: date
    note: str | None = None
    lines: list[VendorBillLineIn] = Field(min_length=1)


class VendorBillLineOut(BaseModel):
    entry_id: int
    rate_item_id: int
    item_no: str
    description: str
    unit: str
    quantity: float
    rate: float
    amount: float


class VendorBillOut(BaseModel):
    vendor_id: int | None
    bill_no: str
    bill_date: date | None
    note: str | None = None
    total_amount: float
    created_at: datetime
    lines: list[VendorBillLineOut]


class ProjectRateSummary(BaseModel):
    project_id: int
    project_name: str
    total_boq_amount: float
    total_executed_amount: float
    progress_pct: float | None
    items: list[RateItemOut]


class InvoiceActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_id: int
    actor_id: int
    action: str
    note: str | None
    created_at: datetime


class InvoiceCreate(BaseModel):
    project_id: int
    invoice_no: str = Field(min_length=1, max_length=64)
    invoice_date: date
    payment_type: str = Field(min_length=1, max_length=128)
    amount: float = Field(gt=0)
    chainage_from: str | None = None
    chainage_to: str | None = None
    notes: str | None = None
    piu: str | None = None
    faro: str | None = None
    bill_from: date | None = None
    bill_to: date | None = None
    project_title: str | None = None
    authority_engineer: str | None = None
    contractor_name: str | None = None
    contract_price: float | None = None
    summary: dict | None = None
    signature_name: str | None = None


class InvoiceSummaryUpdate(BaseModel):
    project_title: str | None = None
    authority_engineer: str | None = None
    contractor_name: str | None = None
    contract_price: float | None = None
    summary: dict
    signature_name: str | None = None
    amount: float | None = None


class InvoiceRecommend(BaseModel):
    payment_mode: str = Field(description="full | provisional | balance")
    recommended_amount: float = Field(gt=0)
    calculation_note: str | None = None
    note: str | None = None


class InvoiceAction(BaseModel):
    note: str | None = None
    upc: str | None = None
    approved_amount: float | None = None
    voucher_no: str | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    transaction_id: str
    invoice_no: str
    invoice_date: date
    payment_type: str
    payment_mode: str
    amount: float
    recommended_amount: float | None
    approved_amount: float | None
    upc: str | None
    piu: str | None = None
    faro: str | None = None
    chainage_from: str | None
    chainage_to: str | None
    bill_from: date | None = None
    bill_to: date | None = None
    recommended_ae_amount: float | None = None
    recommended_piu_amount: float | None = None
    net_amount_released: float | None = None
    voucher_no: str | None = None
    status_detail: str | None = None
    status: str
    submitted_by_id: int
    notes: str | None
    calculation_json: str | None
    project_title: str | None = None
    authority_engineer: str | None = None
    contractor_name: str | None = None
    contract_price: float | None = None
    summary: dict | None = None
    signature_name: str | None = None
    signature_at: datetime | None = None
    this_bill_amount: float | None = None
    cumulative_amount: float | None = None
    contract_amount_cr: float | None = None
    invoice_pdf_path: str | None = None
    final_bill_pdf_path: str | None = None
    diary_note: str | None = None
    diary_signature: str | None = None
    correspondence_path: str | None = None
    submitted_by_role: str | None = None
    gmc_review_status: str = "approved"
    gmc_remark: str | None = None
    gmc_reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    activities: list[InvoiceActivityOut] = []


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int | None
    folder_id: int | None = None
    category: str
    title: str
    description: str | None
    file_path: str
    uploaded_by_id: int
    current_version: int = 1
    approval_status: str = "draft"
    classification: str = "internal"
    watermark_text: str | None = None
    signature_data: str | None = None
    checked_out_by_id: int | None = None
    checked_out_at: datetime | None = None
    created_at: datetime


class DocumentFolderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    folder_type: str
    parent_id: int | None
    project_id: int | None
    sort_order: int
    created_at: datetime
    children: list["DocumentFolderOut"] = []
    document_count: int = 0


DocumentFolderOut.model_rebuild()


class VendorCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    project_id: int | None = None
    contractor_user_id: int | None = None
    brief: str | None = None
    progress_notes: str | None = None
    delay_notes: str | None = None
    escalation_matrix: str | None = None
    type_of_work: str | None = None
    work_order_date: date | None = None
    commencement_date: date | None = None
    time_limit_completion: str | None = None
    defects_liability_period: str | None = None
    extension_of_time: str | None = None
    remarks: str | None = None
    work_order_path: str | None = None
    loa_path: str | None = None


class VendorDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    vendor_id: int
    doc_type: str
    file_path: str
    file_name: str | None = None
    uploaded_by_id: int | None = None
    created_at: datetime


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int | None
    name: str
    contractor_user_id: int | None
    brief: str | None
    progress_notes: str | None
    delay_notes: str | None
    escalation_matrix: str | None
    work_order_path: str | None = None
    loa_path: str | None = None
    type_of_work: str | None = None
    work_order_date: date | None = None
    commencement_date: date | None = None
    time_limit_completion: str | None = None
    defects_liability_period: str | None = None
    extension_of_time: str | None = None
    remarks: str | None = None
    created_at: datetime
    updated_at: datetime


class MprOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    vendor_id: int | None
    folder_id: int | None
    package_name: str
    report_month: date
    physical_progress: str | None
    financial_progress: str | None
    rating_performance: str | None
    timely_execution: str | None
    pending_activity: str | None
    critical_observation: str | None
    last_remarks: str | None
    pdf_path: str | None
    submitted_by_id: int | None
    review_status: str | None = "pending"
    review_remark: str | None = None
    reviewed_by_id: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class DashboardStats(BaseModel):
    total_projects: int
    total_issues: int
    by_status: dict[str, int]
    delayed_issues: int
    avg_resolution_days: float | None
    timeline_compliance_pct: float | None
    contractor_performance: list[dict]
    surveyor_performance: list[dict]
    total_invoices: int = 0
    invoices_by_status: dict[str, int] = {}
    total_documents: int = 0
    total_vendors: int = 0
    total_boq_amount: float = 0
    total_executed_amount: float = 0

