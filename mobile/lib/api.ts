const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000";

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
  description: string;
  status: string;
  priority: string;
  chainage?: string;
  before_lat: number;
  before_lng: number;
  deadline_date: string;
  remaining_days?: number;
  assigned_contractor_id: number;
  reported_by_id: number;
  before_photo_path?: string;
  completion_photo_path?: string | null;
  verification_photo_path?: string | null;
  completion_remarks?: string | null;
  rejection_history?: {
    id: number;
    reason: string;
    comments: string | null;
    created_at: string;
  }[];
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
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
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
  projects: (token: string) => request<any[]>("/api/v1/projects", { token }),
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
  catalog: (token: string) =>
    request<{
      categories: { id: string; name: string }[];
      types: { id: string; label: string; category_id: string }[];
    }>("/api/v1/catalog/defects", { token }),
};

export { API_URL };
