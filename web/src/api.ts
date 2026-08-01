import type {
  DashboardStats,
  Issue,
  IssueStatus,
  Project,
  ProjectRateSummary,
  RateItem,
  TokenResponse,
  User,
} from "./types";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export type Notification = {
  id: number;
  user_id: number;
  issue_id: number | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function mediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const name = path.split(/[/\\]/).pop() || path;
  return `${API_URL}/uploads/${name}`;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail || "Request failed", res.status);
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("Content-Type") || "";
  if (type.includes("application/json")) return res.json();
  return res as unknown as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login/json", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) => request<User>("/api/v1/auth/me", { token }),

  dashboard: (token: string) =>
    request<DashboardStats>("/api/v1/analytics/dashboard", { token }),

  projects: (token: string) => request<Project[]>("/api/v1/projects", { token }),

  createProject: (
    token: string,
    body: {
      name: string;
      location: string;
      description?: string;
      chainage_from?: string;
      chainage_to?: string;
      contractor_ids?: number[];
      surveyor_ids?: number[];
    }
  ) =>
    request<Project>("/api/v1/projects", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  users: (token: string, role?: string) =>
    request<User[]>(`/api/v1/users${role ? `?role=${role}` : ""}`, { token }),

  createUser: (
    token: string,
    body: {
      email: string;
      full_name: string;
      role: string;
      password: string;
      phone?: string;
      is_active?: boolean;
    }
  ) =>
    request<User>("/api/v1/users", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  updateUser: (token: string, id: number, body: Record<string, unknown>) =>
    request<User>(`/api/v1/users/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  issues: (token: string, status?: IssueStatus | null, projectId?: number | null) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (projectId) params.set("project_id", String(projectId));
    const q = params.toString();
    return request<Issue[]>(`/api/v1/issues${q ? `?${q}` : ""}`, { token });
  },

  issue: (token: string, id: number) => request<Issue>(`/api/v1/issues/${id}`, { token }),

  startIssue: (token: string, id: number) =>
    request<Issue>(`/api/v1/issues/${id}/start`, { method: "POST", token }),

  reworkStart: (token: string, id: number) =>
    request<Issue>(`/api/v1/issues/${id}/rework/start`, { method: "POST", token }),

  completeIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/complete`, { method: "POST", token, body: form }),

  approveIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/verify/approve`, { method: "POST", token, body: form }),

  rejectIssue: (token: string, id: number, form: FormData) =>
    request<Issue>(`/api/v1/issues/${id}/verify/reject`, { method: "POST", token, body: form }),

  adminUpdateIssue: (token: string, id: number, body: Record<string, unknown>) =>
    request<Issue>(`/api/v1/issues/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  exportExcel: async (token: string) => {
    const res = await fetch(`${API_URL}/api/v1/analytics/export/excel`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError("Export failed", res.status);
    return res.blob();
  },

  exportPdf: async (token: string) => {
    const res = await fetch(`${API_URL}/api/v1/analytics/export/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError("Export failed", res.status);
    return res.blob();
  },

  catalog: (token: string) =>
    request<{
      categories: { id: string; name: string }[];
      types: { id: string; label: string; category_id: string }[];
    }>("/api/v1/catalog/defects", { token }),

  notifications: (token: string, unreadOnly = false) =>
    request<Notification[]>(
      `/api/v1/notifications${unreadOnly ? "?unread_only=true" : ""}`,
      { token }
    ),

  markNotificationRead: (token: string, id: number) =>
    request<Notification>(`/api/v1/notifications/${id}/read`, { method: "POST", token }),

  markAllNotificationsRead: (token: string) =>
    request<{ marked: number }>("/api/v1/notifications/read-all", { method: "POST", token }),

  rateItems: (token: string, projectId?: number) =>
    request<RateItem[]>(
      `/api/v1/rates${projectId ? `?project_id=${projectId}` : ""}`,
      { token }
    ),

  createRateItem: (
    token: string,
    body: {
      project_id: number;
      item_no: string;
      description: string;
      unit: string;
      boq_quantity: number;
      rate: number;
      remarks?: string;
    }
  ) =>
    request<RateItem>("/api/v1/rates", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  deleteRateItem: (token: string, id: number) =>
    request<void>(`/api/v1/rates/${id}`, { method: "DELETE", token }),

  projectRateSummary: (token: string, projectId: number) =>
    request<ProjectRateSummary>(`/api/v1/rates/summary/${projectId}`, { token }),
};

export { ApiError, API_URL };
