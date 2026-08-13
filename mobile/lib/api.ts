const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  "https://roadservice.onrender.com"
).replace(/\/$/, "");

export type TokenResponse = {
  access_token: string;
  role: "government" | "admin" | "contractor" | "surveyor";
  user_id: number;
  full_name: string;
};

export type Issue = {
  id: number;
  project_id: number;
  issue_type: string;
  work_category: string;
  issue_type_label?: string | null;
  work_category_label?: string | null;
  description: string;
  status: string;
  priority: string;
  chainage?: string;
  lane?: string | null;
  side?: string | null;
  carriageway?: string | null;
  is_critical?: boolean;
  start_chainage?: string | null;
  end_chainage?: string | null;
  voice_note?: string | null;
  before_lat: number;
  before_lng: number;
  before_photo_path?: string;
  completion_photo_path?: string | null;
  verification_photo_path?: string | null;
  deadline_date: string;
  remaining_days?: number;
  assigned_contractor_id: number;
  reported_by_id: number;
  completion_remarks?: string | null;
  rejection_history?: {
    id: number;
    reason: string;
    comments: string | null;
    created_at: string;
  }[];
};

export type RateItemSurveyor = {
  id: number;
  project_id: number;
  item_no: string;
  description: string;
  unit: string;
  executed_quantity: number;
};

export type Project = {
  id: number;
  name: string;
  location?: string | null;
  description?: string | null;
  ucc?: string;
};

export type SiteNcr = {
  id: number;
  ncr_no: string;
  project_id: number;
  related_rfi_id: number | null;
  chainage_start: string | null;
  chainage_end: string | null;
  category: string | null;
  sub_category: string | null;
  item: string | null;
  layer: string | null;
  side: string | null;
  description: string;
  rectification_duration: string | null;
  status: string;
  stage: string | null;
  block_succeeding_rfis: boolean;
  created_at: string;
};

export type PmmSurvey = {
  id: number;
  project_id: number;
  status: string;
  survey_date: string | null;
  remarks: string | null;
  lane_length_km: number | null;
  distress_json?: string | null;
  created_at: string;
  updated_at: string;
};

export type CriticalIssue = {
  id: number;
  issue_no: string;
  project_id: number;
  description: string;
  issue_type: string | null;
  status: string;
  expected_resolution: string | null;
  concerned_authority: string | null;
  chainage_from: string | null;
  chainage_to: string | null;
  total_length_km: number | null;
  priority: string | null;
  remarks: string | null;
  created_at: string;
};

export type RoadWarning = {
  id: number;
  project_id: number;
  title: string;
  chainage: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

export type SiteRfi = {
  id: number;
  rfi_no: string;
  project_id: number;
  related_issue_id: number | null;
  subject: string;
  description: string;
  chainage: string | null;
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
  ae_name?: string | null;
  contractor_name?: string | null;
  category?: string | null;
  inspection_date?: string | null;
};

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? data;
    } catch {
      /* ignore */
    }
    if (Array.isArray(detail)) {
      detail = detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
          return field ? `${field}: ${d.msg}` : d.msg || JSON.stringify(d);
        })
        .join("\n");
    } else if (typeof detail !== "string") {
      detail = JSON.stringify(detail);
    }
    throw new Error(String(detail) || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login/json", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  issues: (token: string, status?: string) =>
    request<Issue[]>(`/api/v1/issues${status ? `?status=${status}` : ""}`, { token }),
  issue: (token: string, id: number) => request<Issue>(`/api/v1/issues/${id}`, { token }),
  projects: (token: string) => request<Project[]>("/api/v1/projects", { token }),
  startIssue: (token: string, id: number) =>
    request<Issue>(`/api/v1/issues/${id}/start`, { method: "POST", token }),
  createIssue: (token: string, form: FormData) =>
    request<Issue>("/api/v1/issues", { method: "POST", token, body: form }),
  completeIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/complete`, { method: "POST", token, body: form }),
  approveIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/verify/approve`, { method: "POST", token, body: form }),
  rejectIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/verify/reject`, { method: "POST", token, body: form }),
  reworkStart: (token: string, id: number) =>
    request<Issue>(`/api/v1/issues/${id}/rework/start`, { method: "POST", token }),
  notifications: (token: string) =>
    request<
      { id: number; title: string; message: string; is_read: boolean; created_at: string; issue_id?: number | null }[]
    >("/api/v1/notifications", { token }),
  markNotificationRead: (token: string, id: number) =>
    request(`/api/v1/notifications/${id}/read`, { method: "POST", token }),
  markAllNotificationsRead: (token: string) =>
    request<{ marked: number }>("/api/v1/notifications/read-all", { method: "POST", token }),
  rateItems: (token: string, projectId?: number) =>
    request<RateItemSurveyor[]>(
      `/api/v1/rates${projectId ? `?project_id=${projectId}` : ""}`,
      { token }
    ),
  addQuantity: (token: string, itemId: number, body: { quantity: number; note?: string }) =>
    request(`/api/v1/rates/${itemId}/quantity`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  catalog: (token: string) =>
    request<{
      categories: { id: string; name: string }[];
      types: { id: string; label: string; category_id: string }[];
    }>("/api/v1/catalog/defects", { token }),

  punchAttendance: (
    token: string,
    body: {
      latitude?: number;
      longitude?: number;
      project_id?: number;
      punch_type?: "in" | "out";
      selfie_uri?: string;
    }
  ) => {
    const qs = new URLSearchParams();
    if (body.latitude != null) qs.set("latitude", String(body.latitude));
    if (body.longitude != null) qs.set("longitude", String(body.longitude));
    if (body.project_id != null) qs.set("project_id", String(body.project_id));
    if (body.punch_type) qs.set("punch_type", body.punch_type);
    if (body.selfie_uri) qs.set("selfie_note", body.selfie_uri.slice(0, 400));
    const q = qs.toString();
    return request<{ id: number; in_time?: string | null; out_time?: string | null }>(
      `/api/v1/nhit/attendance/punch${q ? `?${q}` : ""}`,
      { method: "POST", token }
    );
  },

  rfis: (token: string, status?: string) =>
    request<SiteRfi[]>(`/api/v1/rfis${status ? `?status=${status}` : ""}`, { token }),
  raiseRfi: (
    token: string,
    body: {
      project_id: number;
      subject: string;
      description: string;
      chainage?: string;
      priority?: string;
      related_issue_id?: number;
    }
  ) => {
    const fd = new FormData();
    fd.append("project_id", String(body.project_id));
    fd.append("subject", body.subject);
    fd.append("description", body.description);
    if (body.chainage) fd.append("chainage", body.chainage);
    if (body.priority) fd.append("priority", body.priority);
    if (body.related_issue_id) fd.append("related_issue_id", String(body.related_issue_id));
    return request<SiteRfi>("/api/v1/rfis", { method: "POST", token, body: fd });
  },
  answerRfi: (token: string, id: number, body: { answer_text: string }) =>
    request<SiteRfi>(`/api/v1/rfis/${id}/answer`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  closeRfi: (token: string, id: number) =>
    request<SiteRfi>(`/api/v1/rfis/${id}/close`, { method: "POST", token }),

  fieldProjects: (token: string) =>
    request<Project[]>("/api/v1/field/projects", { token }),
  ncrs: (token: string) => request<SiteNcr[]>("/api/v1/field/ncrs", { token }),
  raiseNcr: (
    token: string,
    body: {
      project_id: number;
      related_rfi_id?: number;
      chainage_start?: string;
      chainage_end?: string;
      category?: string;
      sub_category?: string;
      item?: string;
      layer?: string;
      side?: string;
      description: string;
      rectification_duration?: string;
      block_succeeding_rfis?: boolean;
    }
  ) => request<SiteNcr>("/api/v1/field/ncrs", { method: "POST", token, body: JSON.stringify(body) }),
  pmmList: (token: string) => request<PmmSurvey[]>("/api/v1/field/pmm", { token }),
  raisePmm: (
    token: string,
    body: {
      project_id: number;
      remarks?: string;
      lane_length_km?: number;
      distress_json?: string;
      survey_date?: string;
    }
  ) => request<PmmSurvey>("/api/v1/field/pmm", { method: "POST", token, body: JSON.stringify(body) }),
  updatePmmStatus: (token: string, id: number, status: string) =>
    request<PmmSurvey>(`/api/v1/field/pmm/${id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }),
  criticalList: (token: string) => request<CriticalIssue[]>("/api/v1/field/critical", { token }),
  raiseCritical: (
    token: string,
    body: {
      project_id: number;
      description: string;
      issue_type?: string;
      status?: string;
      expected_resolution?: string;
      concerned_authority?: string;
      chainage_from?: string;
      chainage_to?: string;
      total_length_km?: number;
      priority?: string;
      remarks?: string;
    }
  ) =>
    request<CriticalIssue>("/api/v1/field/critical", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  updateCriticalStatus: (token: string, id: number, status: string) =>
    request<CriticalIssue>(`/api/v1/field/critical/${id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status }),
    }),
  updateNcrStatus: (token: string, id: number, status: string, stage?: string) =>
    request<SiteNcr>(`/api/v1/field/ncrs/${id}/status`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ status, stage }),
    }),
  warnings: (token: string) => request<RoadWarning[]>("/api/v1/field/warnings", { token }),
  raiseWarning: (
    token: string,
    body: { project_id: number; title: string; chainage?: string; note?: string }
  ) =>
    request<RoadWarning>("/api/v1/field/warnings", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
};

export { API_URL };
