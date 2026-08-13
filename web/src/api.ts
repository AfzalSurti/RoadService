import type {
  DashboardStats,
  DocumentFolder,
  Invoice,
  Issue,
  IssueStatus,
  MprReport,
  OrgStaffDetail,
  PortalDocument,
  PortalQueryTicket,
  Project,
  ProjectRateSummary,
  RateItem,
  SiteRfi,
  StaffMeta,
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

  exportExcel: async (
    token: string,
    params?: {
      project_id?: number;
      date_from?: string;
      date_to?: string;
      package_name?: string;
      report_title?: string;
      prepared_by?: string;
      remarks?: string;
      period_type?: "daily" | "weekly" | "custom";
    }
  ) => {
    const q = new URLSearchParams();
    if (params?.project_id != null) q.set("project_id", String(params.project_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.package_name) q.set("package_name", params.package_name);
    if (params?.report_title) q.set("report_title", params.report_title);
    if (params?.prepared_by) q.set("prepared_by", params.prepared_by);
    if (params?.remarks) q.set("remarks", params.remarks);
    if (params?.period_type) q.set("period_type", params.period_type);
    const qs = q.toString();
    const res = await fetch(`${API_URL}/api/v1/analytics/export/excel${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError("Export failed", res.status);
    return res.blob();
  },

  importExcel: async (token: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{
      ok: boolean;
      updated: number;
      skipped: number;
      errors: string[];
      imported_by: string;
      filename: string;
    }>("/api/v1/analytics/import/excel", { method: "POST", token, body: fd });
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

  addQuantity: (
    token: string,
    itemId: number,
    body: { quantity: number; note?: string }
  ) =>
    request<{ id: number; quantity: number; amount: number }>(`/api/v1/rates/${itemId}/quantity`, {
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

  createInvoiceClaim: (token: string, form: FormData) =>
    request<Invoice>("/api/v1/billing/invoices/claim", { method: "POST", token, body: form }),

  uploadFinalBill: (token: string, id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<Invoice>(`/api/v1/billing/invoices/${id}/final-bill`, {
      method: "POST",
      token,
      body: fd,
    });
  },

  saveInvoiceDiary: (token: string, id: number, form: FormData) =>
    request<Invoice>(`/api/v1/billing/invoices/${id}/diary`, { method: "POST", token, body: form }),

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

  createDocumentFolder: (token: string, name: string, parentId?: number | null) => {
    const fd = new FormData();
    fd.append("name", name);
    if (parentId != null) fd.append("parent_id", String(parentId));
    return request<DocumentFolder>("/api/v1/documents/folders", { method: "POST", token, body: fd });
  },

  renameDocumentFolder: (token: string, id: number, name: string) => {
    const fd = new FormData();
    fd.append("name", name);
    return request<DocumentFolder>(`/api/v1/documents/folders/${id}`, {
      method: "PATCH",
      token,
      body: fd,
    });
  },

  uploadDocument: (token: string, form: FormData) =>
    request<PortalDocument>("/api/v1/documents", { method: "POST", token, body: form }),

  vendors: (token: string) => request<Vendor[]>("/api/v1/vendors", { token }),

  createVendor: (token: string, form: FormData) =>
    request<Vendor>("/api/v1/vendors", {
      method: "POST",
      token,
      body: form,
    }),

  listMpr: (token: string, projectId?: number) =>
    request<MprReport[]>(`/api/v1/mpr${projectId ? `?project_id=${projectId}` : ""}`, { token }),

  createMpr: (token: string, form: FormData) =>
    request<MprReport>("/api/v1/mpr", { method: "POST", token, body: form }),

  uploadMprPdf: (token: string, id: number, file: File) => {
    const fd = new FormData();
    fd.append("pdf_file", file);
    return request<MprReport>(`/api/v1/mpr/${id}/pdf`, { method: "POST", token, body: fd });
  },

  staffMeta: (token: string) => request<StaffMeta>("/api/v1/staff-details/meta", { token }),

  staffDetails: (token: string, organization?: string) =>
    request<OrgStaffDetail[]>(
      `/api/v1/staff-details${organization ? `?organization=${encodeURIComponent(organization)}` : ""}`,
      { token }
    ),

  createStaffDetail: (
    token: string,
    body: {
      project_name: string;
      position: string;
      name: string;
      date_of_joining: string;
      mobile_no: string;
      alternate_mobile_no?: string;
      email_id: string;
    }
  ) =>
    request<OrgStaffDetail>("/api/v1/staff-details", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  updateStaffDetail: (
    token: string,
    id: number,
    body: {
      project_name: string;
      position: string;
      name: string;
      date_of_joining: string;
      mobile_no: string;
      alternate_mobile_no?: string;
      email_id: string;
    }
  ) =>
    request<OrgStaffDetail>(`/api/v1/staff-details/${id}`, {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    }),

  deleteStaffDetail: (token: string, id: number) =>
    request<{ ok: boolean }>(`/api/v1/staff-details/${id}`, { method: "DELETE", token }),

  queryMeta: (token: string) =>
    request<{ module_areas: string[]; priorities: string[]; statuses: string[] }>(
      "/api/v1/queries/meta",
      { token }
    ),

  queries: (token: string, status?: string, moduleArea?: string) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (moduleArea) qs.set("module_area", moduleArea);
    const q = qs.toString();
    return request<PortalQueryTicket[]>(`/api/v1/queries${q ? `?${q}` : ""}`, { token });
  },

  getQuery: (token: string, id: number) =>
    request<PortalQueryTicket>(`/api/v1/queries/${id}`, { token }),

  raiseQuery: (token: string, form: FormData) =>
    request<PortalQueryTicket>("/api/v1/queries", {
      method: "POST",
      token,
      body: form,
    }),

  startQuery: (token: string, id: number, note?: string) =>
    request<PortalQueryTicket>(`/api/v1/queries/${id}/start`, {
      method: "POST",
      token,
      body: JSON.stringify({ status: "in_progress", note }),
    }),

  resolveQuery: (
    token: string,
    id: number,
    body: { resolution_note: string; status?: string }
  ) =>
    request<PortalQueryTicket>(`/api/v1/queries/${id}/resolve`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  reopenQuery: (token: string, id: number, body: { note: string }) =>
    request<PortalQueryTicket>(`/api/v1/queries/${id}/reopen`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  commentQuery: (token: string, id: number, body: { note: string }) =>
    request<PortalQueryTicket>(`/api/v1/queries/${id}/comments`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  rfis: (
    token: string,
    params?: { status?: string; project_id?: number; ae_name?: string; contractor?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.project_id) qs.set("project_id", String(params.project_id));
    if (params?.ae_name) qs.set("ae_name", params.ae_name);
    if (params?.contractor) qs.set("contractor", params.contractor);
    const q = qs.toString();
    return request<SiteRfi[]>(`/api/v1/rfis${q ? `?${q}` : ""}`, { token });
  },

  getRfi: (token: string, id: number) => request<SiteRfi>(`/api/v1/rfis/${id}`, { token }),

  raiseRfi: (token: string, form: FormData) =>
    request<SiteRfi>("/api/v1/rfis", {
      method: "POST",
      token,
      body: form,
    }),

  answerRfi: (token: string, id: number, body: { answer_text: string }) =>
    request<SiteRfi>(`/api/v1/rfis/${id}/answer`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  closeRfi: (token: string, id: number) =>
    request<SiteRfi>(`/api/v1/rfis/${id}/close`, { method: "POST", token }),

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
