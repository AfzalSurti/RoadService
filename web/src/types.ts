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
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  role: Role;
  user_id: number;
  full_name: string;
};
