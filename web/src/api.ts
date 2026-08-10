import type {
  DashboardStats,
  DocumentFolder,
  Invoice,
  Issue,
  IssueStatus,
  PortalDocument,
  Project,
  ProjectRateSummary,
  RateItem,
  TokenResponse,
  User,
  Vendor,
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
  login: (email: string, password: string, mfaPin?: string) =>
    request<TokenResponse>("/api/v1/auth/login/json", {
      method: "POST",
      body: JSON.stringify({ email, password, mfa_pin: mfaPin || undefined }),
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

  invoices: (token: string) => request<Invoice[]>("/api/v1/billing/invoices", { token }),

  createInvoice: (
    token: string,
    body: {
      project_id: number;
      invoice_no: string;
      invoice_date: string;
      payment_type: string;
      amount: number;
      chainage_from?: string;
      chainage_to?: string;
      notes?: string;
      piu?: string;
      faro?: string;
      bill_from?: string;
      bill_to?: string;
      project_title?: string;
      authority_engineer?: string;
      contractor_name?: string;
      contract_price?: number;
      summary?: Record<string, unknown>;
      signature_name?: string;
    }
  ) =>
    request<Invoice>("/api/v1/billing/invoices", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  billingSummaryTemplate: (token: string) =>
    request<Record<string, unknown>>("/api/v1/billing/summary-template", { token }),

  updateInvoiceSummary: (
    token: string,
    id: number,
    body: {
      project_title?: string;
      authority_engineer?: string;
      contractor_name?: string;
      contract_price?: number;
      summary: Record<string, unknown>;
      signature_name?: string;
      amount?: number;
    }
  ) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/summary`, {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    }),

  recommendInvoice: (
    token: string,
    id: number,
    body: {
      payment_mode: string;
      recommended_amount: number;
      calculation_note?: string;
      note?: string;
    }
  ) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/recommend`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  approveInvoice: (
    token: string,
    id: number,
    body: { upc: string; note?: string; approved_amount?: number; voucher_no?: string }
  ) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/approve`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  rejectInvoice: (token: string, id: number, body: { note?: string }) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/reject`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  seekInvoiceClarification: (token: string, id: number, body: { note?: string }) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/seek-clarification`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  submitInvoiceClarification: (token: string, id: number, body: { note?: string }) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/clarify`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  withdrawInvoice: (token: string, id: number, body: { note?: string }) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/withdraw`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  documents: (token: string, projectId?: number, folderId?: number) => {
    const qs = new URLSearchParams();
    if (projectId) qs.set("project_id", String(projectId));
    if (folderId != null) qs.set("folder_id", String(folderId));
    const q = qs.toString();
    return request<PortalDocument[]>(`/api/v1/documents${q ? `?${q}` : ""}`, { token });
  },

  documentFolders: (token: string) =>
    request<DocumentFolder[]>(`/api/v1/documents/folders`, { token }),

  seedDocumentFolders: (token: string) =>
    request<{ ok: boolean; message: string }>("/api/v1/documents/folders/seed", {
      method: "POST",
      token,
    }),

  uploadDocument: (token: string, form: FormData) =>
    request<PortalDocument>("/api/v1/documents", { method: "POST", token, body: form }),

  vendors: (token: string) => request<Vendor[]>("/api/v1/vendors", { token }),

  createVendor: (
    token: string,
    body: {
      name: string;
      project_id?: number;
      contractor_user_id?: number;
      brief?: string;
      progress_notes?: string;
      delay_notes?: string;
      escalation_matrix?: string;
    }
  ) =>
    request<Vendor>("/api/v1/vendors", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  nhitGet: <T>(token: string, path: string) => request<T>(`/api/v1/nhit${path}`, { token }),

  nhitPost: <T>(token: string, path: string, body?: unknown) =>
    request<T>(`/api/v1/nhit${path}`, {
      method: "POST",
      token,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  nhitPatch: <T>(token: string, path: string, body?: unknown) =>
    request<T>(`/api/v1/nhit${path}`, {
      method: "PATCH",
      token,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  nhitForm: <T>(token: string, path: string, form: FormData) =>
    request<T>(`/api/v1/nhit${path}`, { method: "POST", token, body: form }),

  seedNhitDemo: (token: string) =>
    request<{ ok: boolean; message: string }>("/api/v1/nhit/seed-demo", { method: "POST", token }),
};

export { ApiError, API_URL };
