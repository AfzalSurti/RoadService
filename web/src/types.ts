export type Role = "government" | "admin" | "contractor" | "surveyor";

export type IssueStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "verification_pending"
  | "under_review"
  | "closed";

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
};

export type Project = {
  id: number;
  name: string;
  location: string;
  description?: string | null;
  chainage_from?: string | null;
  chainage_to?: string | null;
  is_active: boolean;
  created_at: string;
  contractors: User[];
  surveyors: User[];
};

export type StatusHistory = {
  id: number;
  from_status: IssueStatus | null;
  to_status: IssueStatus;
  actor_id: number | null;
  note: string | null;
  created_at: string;
};

export type Rejection = {
  id: number;
  reason: string;
  comments: string | null;
  photo_path: string | null;
  lat: number | null;
  lng: number | null;
  rejected_by_id: number;
  created_at: string;
};

export type Issue = {
  id: number;
  project_id: number;
  issue_type: string;
  work_category: string;
  issue_type_label?: string | null;
  work_category_label?: string | null;
  description: string;
  priority: string;
  status: IssueStatus;
  chainage?: string | null;
  before_photo_path: string;
  before_lat: number;
  before_lng: number;
  completion_photo_path?: string | null;
  completion_lat?: number | null;
  completion_lng?: number | null;
  completion_remarks?: string | null;
  completed_at?: string | null;
  verification_photo_path?: string | null;
  verification_lat?: number | null;
  verification_lng?: number | null;
  verified_at?: string | null;
  deadline_days: number;
  deadline_date: string;
  remaining_days?: number | null;
  reported_by_id: number;
  assigned_contractor_id: number;
  created_at: string;
  updated_at: string;
  status_history: StatusHistory[];
  rejection_history: Rejection[];
};

export type DashboardStats = {
  total_projects: number;
  total_issues: number;
  by_status: Record<string, number>;
  delayed_issues: number;
  avg_resolution_days: number | null;
  timeline_compliance_pct: number | null;
  contractor_performance: { contractor_id: number; total: number; closed: number }[];
  surveyor_performance: { surveyor_id: number; reported: number }[];
  total_invoices?: number;
  invoices_by_status?: Record<string, number>;
  total_documents?: number;
  total_vendors?: number;
  total_boq_amount?: number;
  total_executed_amount?: number;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  role: Role;
  user_id: number;
  full_name: string;
};

export type RateItem = {
  id: number;
  project_id: number;
  item_no: string;
  description: string;
  unit: string;
  boq_quantity: number;
  rate: number;
  boq_amount: number;
  executed_quantity: number;
  executed_amount: number;
  progress_pct?: number | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
};

export type RateItemSurveyor = {
  id: number;
  project_id: number;
  item_no: string;
  description: string;
  unit: string;
  executed_quantity: number;
};

export type ProjectRateSummary = {
  project_id: number;
  project_name: string;
  total_boq_amount: number;
  total_executed_amount: number;
  progress_pct: number | null;
  items: RateItem[];
};

export type InvoiceActivity = {
  id: number;
  invoice_id: number;
  actor_id: number;
  action: string;
  note: string | null;
  created_at: string;
};

export type Invoice = {
  id: number;
  project_id: number;
  transaction_id: string;
  invoice_no: string;
  invoice_date: string;
  payment_type: string;
  payment_mode: string;
  amount: number;
  recommended_amount: number | null;
  approved_amount: number | null;
  upc: string | null;
  piu?: string | null;
  faro?: string | null;
  chainage_from: string | null;
  chainage_to: string | null;
  bill_from?: string | null;
  bill_to?: string | null;
  recommended_ae_amount?: number | null;
  recommended_piu_amount?: number | null;
  net_amount_released?: number | null;
  voucher_no?: string | null;
  status_detail?: string | null;
  status: string;
  submitted_by_id: number;
  notes: string | null;
  calculation_json: string | null;
  project_title?: string | null;
  authority_engineer?: string | null;
  contractor_name?: string | null;
  contract_price?: number | null;
  summary?: Record<string, unknown> | null;
  signature_name?: string | null;
  signature_at?: string | null;
  this_bill_amount?: number | null;
  cumulative_amount?: number | null;
  contract_amount_cr?: number | null;
  invoice_pdf_path?: string | null;
  final_bill_pdf_path?: string | null;
  diary_note?: string | null;
  diary_signature?: string | null;
  correspondence_path?: string | null;
  created_at: string;
  updated_at: string;
  activities: InvoiceActivity[];
};

export type PortalDocument = {
  id: number;
  project_id: number | null;
  folder_id?: number | null;
  category: string;
  title: string;
  description: string | null;
  file_path: string;
  uploaded_by_id: number;
  current_version?: number;
  approval_status?: string;
  classification?: string;
  watermark_text?: string | null;
  signature_data?: string | null;
  checked_out_by_id?: number | null;
  checked_out_at?: string | null;
  created_at: string;
};

export type DocumentFolder = {
  id: number;
  name: string;
  folder_type: string;
  parent_id: number | null;
  project_id: number | null;
  sort_order: number;
  created_at: string;
  children: DocumentFolder[];
  document_count: number;
};

export type Vendor = {
  id: number;
  project_id: number | null;
  name: string;
  contractor_user_id: number | null;
  brief: string | null;
  progress_notes: string | null;
  delay_notes: string | null;
  escalation_matrix: string | null;
  work_order_path?: string | null;
  loa_path?: string | null;
  type_of_work?: string | null;
  work_order_date?: string | null;
  commencement_date?: string | null;
  time_limit_completion?: string | null;
  defects_liability_period?: string | null;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
};

export type MprReport = {
  id: number;
  project_id: number;
  vendor_id: number | null;
  folder_id: number | null;
  package_name: string;
  report_month: string;
  physical_progress: string | null;
  financial_progress: string | null;
  rating_performance: string | null;
  timely_execution: string | null;
  pending_activity: string | null;
  critical_observation: string | null;
  last_remarks: string | null;
  pdf_path: string | null;
  submitted_by_id: number | null;
  created_at: string;
  updated_at: string;
};

export type OrgStaffDetail = {
  id: number;
  organization: string;
  organization_label: string;
  project_name: string;
  position: string;
  name: string;
  date_of_joining: string;
  mobile_no: string;
  alternate_mobile_no: string | null;
  email_id: string;
  owner_user_id: number;
  created_by_id: number;
  can_edit: boolean;
};

export type StaffMeta = {
  my_organization: string | null;
  my_organization_label: string;
  can_add: boolean;
  organizations: { id: string; label: string }[];
};

export type PortalQueryComment = {
  id: number;
  ticket_id: number;
  actor_id: number;
  note: string;
  action: string;
  created_at: string;
};

export type PortalQueryTicket = {
  id: number;
  ticket_no: string;
  project_id: number | null;
  module_area: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  raised_by_id: number;
  assigned_to_id: number | null;
  resolution_note: string | null;
  resolved_by_id: number | null;
  resolved_at: string | null;
  attachment_path?: string | null;
  created_at: string;
  updated_at: string;
  can_resolve: boolean;
  comments?: PortalQueryComment[];
};

export type SiteRfi = {
  id: number;
  rfi_no: string;
  project_id: number;
  related_issue_id: number | null;
  subject: string;
  description: string;
  chainage: string | null;
  ae_name?: string | null;
  contractor_name?: string | null;
  category?: string | null;
  inspection_date?: string | null;
  photo_path?: string | null;
  priority: string;
  status: string;
  raised_by_id: number;
  answer_text: string | null;
  answered_by_id: number | null;
  answered_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  can_answer: boolean;
  can_close: boolean;
  can_raise?: boolean;
};
