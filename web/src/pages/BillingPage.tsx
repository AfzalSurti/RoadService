import { FormEvent, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { ProjectSelect } from "../components/ProjectSelect";
import { formatLabel } from "../components/StatusBadge";
import type { Invoice, Project } from "../types";

const PAYMENT_TYPES = [
  "Stage Payment Statement for Works",
  "Other",
  "Mobilisation Advance",
  "Price Adjustment",
  "Final Bill",
];

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB");
}

type StatusFilter = "all" | "pending" | "approve" | "reject" | "clarify";

function matchesFilter(inv: Invoice, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return inv.status === "submitted" || inv.status === "recommended";
  if (filter === "approve") return inv.status === "approved";
  if (filter === "reject") return inv.status === "rejected";
  if (filter === "clarify") return inv.status === "clarification";
  return true;
}

function nhipmplRecommendedBy(inv: Invoice) {
  if (inv.authority_engineer) return inv.authority_engineer;
  if (inv.recommended_piu_amount != null) return `₹ ${money(inv.recommended_piu_amount)}`;
  return "—";
}

export function BillingPage() {
  const { token, role, isReadonly, fullName } = useAuth();
  const canUpload = (role === "admin" || role === "government") && !isReadonly;
  const canProcess = (role === "admin" || role === "government") && !isReadonly;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [recommend, setRecommend] = useState({
    payment_mode: "full",
    recommended_amount: "",
    calculation_note: "",
    note: "",
  });
  const [approve, setApprove] = useState({ upc: "", note: "", approved_amount: "", voucher_no: "" });
  const [actionNote, setActionNote] = useState("");
  const [viewMode, setViewMode] = useState<"submission" | "activity">("submission");
  const [diaryOpen, setDiaryOpen] = useState<"none" | "after_submit" | "clarify" | "withdraw" | "view">("none");
  const [diaryNote, setDiaryNote] = useState("");
  const [diarySign, setDiarySign] = useState("");
  const [diaryFile, setDiaryFile] = useState<File | null>(null);
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [claimPdf, setClaimPdf] = useState<File | null>(null);
  const [form, setForm] = useState({
    project_id: "",
    invoice_no: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_type: "",
    amount: "",
    contract_amount_cr: "",
    cumulative_cr: "",
    bill_from: "",
    bill_to: "",
  });

  const load = async () => {
    if (!token) return;
    try {
      const proj = await api.projects(token).catch(() => [] as Project[]);
      setProjects(proj);
      if (!form.project_id && proj[0]) {
        setForm((f) => ({ ...f, project_id: String(proj[0].id) }));
      }
      try {
        const inv = await api.invoices(token);
        setInvoices(inv);
        if (selected) {
          const fresh = inv.find((i) => i.id === selected.id) || null;
          setSelected(fresh);
        }
        setError(null);
      } catch (e: unknown) {
        setInvoices([]);
        setError(
          e instanceof Error
            ? `${e.message} — run NEON_SQL_FIX.sql for invoice columns if this persists.`
            : "Failed to load billing"
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "GMC Billing Procedures";
  }, []);

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    const refresh = () => void load();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [token]);

  const counts = useMemo(
    () => ({
      pending: invoices.filter((i) => i.status === "submitted" || i.status === "recommended").length,
      approve: invoices.filter((i) => i.status === "approved").length,
      reject: invoices.filter((i) => i.status === "rejected").length,
      clarify: invoices.filter((i) => i.status === "clarification").length,
    }),
    [invoices]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (!matchesFilter(inv, filter)) return false;
      if (!q) return true;
      const project = projects.find((p) => p.id === inv.project_id)?.name || "";
      return [
        inv.transaction_id,
        inv.invoice_no,
        inv.piu,
        inv.payment_type,
        inv.status_detail,
        inv.authority_engineer,
        project,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [invoices, filter, search, projects]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filter, search, pageSize]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setActionNote("");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canUpload) return;
    if (!form.project_id) {
      setError("Select a project / package");
      return;
    }
    if (!form.payment_type) {
      setError("Select payment type");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("project_id", form.project_id);
      fd.append("invoice_no", form.invoice_no.trim() || "NA");
      fd.append("invoice_date", form.invoice_date);
      fd.append("payment_type", form.payment_type);
      fd.append("this_bill_amount", form.amount || "0");
      fd.append("cumulative_amount", form.cumulative_cr || form.amount || "0");
      if (form.bill_from) fd.append("bill_from", form.bill_from);
      if (form.bill_to) fd.append("bill_to", form.bill_to);
      if (form.contract_amount_cr) fd.append("contract_amount_cr", form.contract_amount_cr);
      if (claimPdf) fd.append("bill_pdf", claimPdf);
      const created = await api.createInvoiceClaim(token, fd);
      setSelected(created);
      setShowCreate(false);
      setClaimPdf(null);
      setDiaryNote("");
      setDiarySign(fullName || "");
      setDiaryFile(null);
      setDiaryOpen("after_submit");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    const headers = [
      "Transaction ID",
      "NHIPMPL HQ",
      "Payment Type",
      "Invoice No",
      "Invoice Date",
      "Amount",
      "Status",
      "Recommended by NHIPMPL HQ",
    ];
    const lines = filtered.map((inv) =>
      [
        inv.transaction_id,
        inv.piu || "",
        inv.payment_type,
        inv.invoice_no,
        inv.invoice_date,
        inv.amount,
        inv.status_detail || inv.status,
        nhipmplRecommendedBy(inv),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gmc_billing.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = filtered
      .map(
        (inv) =>
          `<tr>
            <td>${inv.transaction_id}</td>
            <td>${inv.invoice_no}</td>
            <td>${money(inv.amount)}</td>
            <td>${inv.status_detail || inv.status}</td>
            <td>${inv.piu || "—"}</td>
          </tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>GMC Billing</title>
      <style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#eee}</style></head>
      <body><h2>GMC Billing Procedures</h2>
      <table><thead><tr><th>Txn</th><th>Invoice</th><th>Amount</th><th>Status</th><th>NHIPMPL HQ</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=5>No rows</td></tr>"}</tbody></table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const docPreview = selected?.correspondence_path || selected?.invoice_pdf_path || selected?.final_bill_pdf_path;

  if (role === "contractor") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="billing-toolbar">
        <div>
          <div className="muted">Home / Finance / GMC Billing Procedures</div>
          <h2 style={{ margin: "0.2rem 0 0" }}>Invoice Processing</h2>
        </div>
        <div className="btn-row">
          {canUpload ? (
            <button className="btn" type="button" onClick={() => setShowCreate(true)}>
              New
            </button>
          ) : null}
          <button className="btn secondary" type="button" onClick={() => setFilter("all")}>
            FILTER
          </button>
        </div>
      </div>

      <section className="billing-status-grid">
        <button
          type="button"
          className={`billing-status-card pending${filter === "pending" ? " active" : ""}`}
          onClick={() => setFilter(filter === "pending" ? "all" : "pending")}
        >
          <span>PENDING</span>
          <strong>{counts.pending}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card approve${filter === "approve" ? " active" : ""}`}
          onClick={() => setFilter(filter === "approve" ? "all" : "approve")}
        >
          <span>APPROVE</span>
          <strong>{counts.approve}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card reject${filter === "reject" ? " active" : ""}`}
          onClick={() => setFilter(filter === "reject" ? "all" : "reject")}
        >
          <span>REJECT</span>
          <strong>{counts.reject}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card clarify${filter === "clarify" ? " active" : ""}`}
          onClick={() => setFilter(filter === "clarify" ? "all" : "clarify")}
        >
          <span>SEEK CLARIFICATION</span>
          <strong>{counts.clarify}</strong>
        </button>
      </section>

      <section className="panel">
        <div className="billing-table-tools">
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={exportPdf}>
              PDF
            </button>
            <button className="btn ghost" type="button" onClick={exportExcel}>
              Excel
            </button>
            <label className="muted">
              Show{" "}
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>{" "}
              entries
            </label>
          </div>
          <label>
            Search{" "}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Txn / invoice no / status…"
            />
          </label>
        </div>

        <div className="table-scroll billing-wide-table">
          <table className="data">
            <thead>
              <tr>
                <th>Action</th>
                <th>View</th>
                <th>Current Status of Invoice</th>
                <th>Transaction ID</th>
                <th>NHIPMPL HQ</th>
                <th>Payment Type</th>
                <th>Invoice No.</th>
                <th>Invoice Date</th>
                <th>Invoice Amount (INR)</th>
                <th>Invoice Submission Date</th>
                <th>Bill Duration From</th>
                <th>Bill Duration To</th>
                <th>Recommended Amount by GMC (INR)</th>
                <th>Recommended Amount By NHIPMPL (INR)</th>
                <th>Net Amount Released (INR)</th>
                <th>Voucher</th>
                <th>Recommendation Document</th>
                <th>Recommended by NHIPMPL HQ</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((inv) => (
                <tr key={inv.id} className={selected?.id === inv.id ? "selected-row" : undefined}>
                  <td>
                    {canProcess ? (
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setOpenActionId(openActionId === inv.id ? null : inv.id)}
                        >
                          Actions
                        </button>
                        {openActionId === inv.id ? (
                          <div className="panel nested" style={{ position: "absolute", zIndex: 5, minWidth: 200 }}>
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => {
                                setSelected(inv);
                                setDiaryNote(inv.diary_note || "");
                                setDiarySign(inv.diary_signature || fullName || "");
                                setDiaryOpen("view");
                                setOpenActionId(null);
                              }}
                            >
                              Notes &amp; documents
                            </button>
                            {role === "admin" && inv.status === "clarification" ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => {
                                  setSelected(inv);
                                  setDiaryOpen("clarify");
                                  setOpenActionId(null);
                                }}
                              >
                                Submit Clarification
                              </button>
                            ) : null}
                            {role === "admin" &&
                            (inv.status === "submitted" || inv.status === "clarification") ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() => {
                                  setSelected(inv);
                                  setDiaryOpen("withdraw");
                                  setOpenActionId(null);
                                }}
                              >
                                Withdraw Invoice
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setSelected(inv);
                        setViewMode("submission");
                      }}
                    >
                      View ▾
                    </button>
                  </td>
                  <td>{inv.status_detail || formatLabel(inv.status)}</td>
                  <td>{inv.transaction_id}</td>
                  <td>{inv.piu || "NHIPMPL HQ"}</td>
                  <td>{inv.payment_type}</td>
                  <td>{inv.invoice_no}</td>
                  <td>{fmtDate(inv.invoice_date)}</td>
                  <td>{money(inv.amount)}</td>
                  <td>{fmtDate(inv.created_at)}</td>
                  <td>{fmtDate(inv.bill_from)}</td>
                  <td>{fmtDate(inv.bill_to)}</td>
                  <td>{money(inv.recommended_ae_amount ?? inv.recommended_amount)}</td>
                  <td>{money(inv.recommended_piu_amount ?? inv.recommended_amount)}</td>
                  <td>
                    {inv.net_amount_released != null
                      ? money(inv.net_amount_released)
                      : inv.status === "approved"
                        ? money(inv.approved_amount)
                        : "Yet to receive"}
                  </td>
                  <td>{inv.voucher_no || "0"}</td>
                  <td>
                    <div className="final-bill-cell">
                      {inv.final_bill_pdf_path ? (
                        <a href={mediaUrl(inv.final_bill_pdf_path)} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {canProcess ? (
                        <label className="upload-icon-btn" title="Upload Recommendation Document">
                          ⬆
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            hidden
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!token || !file) return;
                              try {
                                await api.uploadRecommendationDoc(token, inv.id, file);
                                await load();
                              } catch (err: unknown) {
                                setError(err instanceof Error ? err.message : "PDF upload failed");
                              }
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </td>
                  <td>{nhipmplRecommendedBy(inv)}</td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={18}>No invoices yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="billing-table-foot">
          <span className="muted">
            Showing {filtered.length ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, filtered.length)} of {filtered.length} entries
          </span>
          <div className="btn-row">
            <button className="btn ghost" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="badge">{page}</span>
            <button
              className="btn ghost"
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {selected && diaryOpen === "none" ? (
        <section className="panel">
          <div className="panel-head-row">
            <h2>
              {selected.transaction_id} · {selected.invoice_no}
            </h2>
            <div className="btn-row">
              <button
                type="button"
                className={viewMode === "submission" ? "btn" : "btn ghost"}
                onClick={() => setViewMode("submission")}
              >
                Submission
              </button>
              <button
                type="button"
                className={viewMode === "activity" ? "btn" : "btn ghost"}
                onClick={() => setViewMode("activity")}
              >
                Activity Log
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setDiaryNote(selected.diary_note || "");
                  setDiarySign(selected.diary_signature || fullName || "");
                  setDiaryOpen("view");
                }}
              >
                Notes &amp; documents
              </button>
              <button type="button" className="linkish" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </div>
          <p className="muted">{selected.status_detail}</p>
          <div className="detail-grid">
            <div>
              <strong>NHIPMPL HQ</strong>
              <div>{selected.piu || "NHIPMPL HQ"}</div>
            </div>
            <div>
              <strong>Status</strong>
              <div>{formatLabel(selected.status)}</div>
            </div>
            <div>
              <strong>Payment type</strong>
              <div>{selected.payment_type}</div>
            </div>
            <div>
              <strong>Amount</strong>
              <div>₹ {money(selected.amount)}</div>
            </div>
            <div>
              <strong>Recommended by GMC</strong>
              <div>₹ {money(selected.recommended_ae_amount ?? selected.recommended_amount)}</div>
            </div>
            <div>
              <strong>Recommended by NHIPMPL HQ</strong>
              <div>{nhipmplRecommendedBy(selected)}</div>
            </div>
          </div>

          {viewMode === "activity" ? (
            <ul className="activity-list" style={{ marginTop: "1rem" }}>
              {(selected.activities || []).map((a) => (
                <li key={a.id}>
                  <strong>{formatLabel(a.action)}</strong>
                  {a.note ? ` — ${a.note}` : ""}
                  <span className="muted"> · {new Date(a.created_at).toLocaleString()}</span>
                </li>
              ))}
              {!selected.activities?.length ? <li className="muted">No activity yet.</li> : null}
            </ul>
          ) : null}

          {canProcess ? (
            <div className="action-stack" style={{ marginTop: "1rem" }}>
              {(role === "admin" || role === "government") &&
              (selected.status === "submitted" || selected.status === "clarification") ? (
                <div className="panel nested">
                  <h3>{role === "government" ? "Recommend (NHIPMPL HQ)" : "Recommend payment (GMC)"}</h3>
                  <div className="form-grid">
                    <label>
                      Mode
                      <select
                        value={recommend.payment_mode}
                        onChange={(e) => setRecommend({ ...recommend, payment_mode: e.target.value })}
                      >
                        <option value="full">Full (_F)</option>
                        <option value="provisional">Provisional (_P)</option>
                        <option value="balance">Balance (_B)</option>
                      </select>
                    </label>
                    <label>
                      Recommended amount ₹
                      <input
                        value={recommend.recommended_amount}
                        onChange={(e) => setRecommend({ ...recommend, recommended_amount: e.target.value })}
                        placeholder={String(selected.amount)}
                      />
                    </label>
                    <label className="span-2">
                      Calculation note
                      <textarea
                        value={recommend.calculation_note}
                        onChange={(e) => setRecommend({ ...recommend, calculation_note: e.target.value })}
                      />
                    </label>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      token &&
                      run(() =>
                        api.recommendInvoice(token, selected.id, {
                          payment_mode: recommend.payment_mode,
                          recommended_amount: Number(recommend.recommended_amount || selected.amount),
                          calculation_note: recommend.calculation_note || undefined,
                          note: recommend.note || undefined,
                        })
                      )
                    }
                  >
                    Recommend
                  </button>
                </div>
              ) : null}

              {role === "government" && selected.status === "recommended" ? (
                <div className="panel nested">
                  <h3>Client decision (NHIPMPL)</h3>
                  <div className="form-grid">
                    <label>
                      Approval ref / UPC
                      <input value={approve.upc} onChange={(e) => setApprove({ ...approve, upc: e.target.value })} />
                    </label>
                    <label>
                      Voucher no
                      <input
                        value={approve.voucher_no}
                        onChange={(e) => setApprove({ ...approve, voucher_no: e.target.value })}
                      />
                    </label>
                    <label>
                      Approved amount ₹
                      <input
                        value={approve.approved_amount}
                        onChange={(e) => setApprove({ ...approve, approved_amount: e.target.value })}
                        placeholder={String(selected.recommended_amount ?? selected.amount)}
                      />
                    </label>
                    <label>
                      Note
                      <input value={approve.note} onChange={(e) => setApprove({ ...approve, note: e.target.value })} />
                    </label>
                  </div>
                  <div className="btn-row">
                    <button
                      className="btn"
                      type="button"
                      disabled={busy || !approve.upc.trim()}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.approveInvoice(token, selected.id, {
                            upc: approve.upc.trim(),
                            voucher_no: approve.voucher_no || undefined,
                            note: approve.note || undefined,
                            approved_amount: approve.approved_amount
                              ? Number(approve.approved_amount)
                              : undefined,
                          })
                        )
                      }
                    >
                      Approve
                    </button>
                    <button
                      className="btn danger"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.rejectInvoice(token, selected.id, {
                            note: approve.note || actionNote || "Rejected by NHIPMPL",
                          })
                        )
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.seekInvoiceClarification(token, selected.id, {
                            note: approve.note || actionNote || "Clarification sought",
                          })
                        )
                      }
                    >
                      Seek clarification
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {showCreate && canUpload ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onCreate} style={{ maxWidth: 920 }}>
            <div className="panel-head-row">
              <h2>GMC Billing Procedures — New claim</h2>
              <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>
                Back to Grid
              </button>
            </div>
            <p className="muted">
              Note: Whenever documents are not required to upload please use common template mentioning that
              &quot;Not Applicable&quot;.
            </p>
            <div className="form-grid">
              <ProjectSelect
                required
                label="Project / Package"
                value={form.project_id}
                onChange={(id) => setForm({ ...form, project_id: id })}
              />
              <label>
                Contract Amount (Rs. in Cr.)
                <input
                  type="number"
                  step="0.01"
                  value={form.contract_amount_cr}
                  onChange={(e) => setForm({ ...form, contract_amount_cr: e.target.value })}
                />
              </label>
              <label>
                Cumulative Payment Received Till Date (Rs. in Cr.)
                <input
                  type="number"
                  step="0.01"
                  value={form.cumulative_cr}
                  onChange={(e) => setForm({ ...form, cumulative_cr: e.target.value })}
                />
              </label>
            </div>
            <h3>Details of payment being claimed now</h3>
            <div className="form-grid">
              <label>
                Invoice Duration From
                <input
                  type="date"
                  value={form.bill_from}
                  onChange={(e) => setForm({ ...form, bill_from: e.target.value })}
                />
              </label>
              <label>
                Invoice Duration To
                <input
                  type="date"
                  value={form.bill_to}
                  onChange={(e) => setForm({ ...form, bill_to: e.target.value })}
                />
              </label>
              <label>
                Payment Type
                <select
                  required
                  value={form.payment_type}
                  onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                >
                  <option value="">Select Payment Type</option>
                  {PAYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Invoice No.
                <input
                  value={form.invoice_no}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
                  placeholder="NA"
                />
              </label>
              <label>
                Invoice Date
                <input
                  type="date"
                  required
                  value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                />
              </label>
              <label>
                Invoice Absolute Amount [Rs.]
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </label>
              <label className="span-2">
                Upload Invoice
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setClaimPdf(e.target.files?.[0] || null)}
                />
                <small className="muted">{claimPdf ? claimPdf.name : "No file chosen"}</small>
              </label>
            </div>
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {diaryOpen !== "none" && selected ? (
        <div className="modal-backdrop" onClick={() => setDiaryOpen("none")}>
          <div className="modal-card billing-diary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="panel-head-row">
              <h2>
                {diaryOpen === "clarify"
                  ? "Submit clarification — Notes & documents"
                  : diaryOpen === "withdraw"
                    ? "Withdraw invoice — Notes & documents"
                    : "Notes & documents"}
              </h2>
              <button type="button" className="btn ghost" onClick={() => setDiaryOpen("none")}>
                Back
              </button>
            </div>
            <div className="billing-diary-grid">
              <section className="panel nested">
                <h3>Notepad</h3>
                <textarea
                  value={diaryNote}
                  onChange={(e) => setDiaryNote(e.target.value)}
                  placeholder="Add note"
                  style={{ minHeight: 220 }}
                />
                <label>
                  Digital signature name
                  <input value={diarySign} onChange={(e) => setDiarySign(e.target.value)} />
                </label>
                <button
                  className="btn"
                  type="button"
                  style={{ marginTop: "0.75rem" }}
                  disabled={busy || diaryNote.trim().length < 2}
                  onClick={async () => {
                    if (!token || !selected) return;
                    setBusy(true);
                    try {
                      const fd = new FormData();
                      fd.append("note", diaryNote.trim());
                      if (diarySign.trim()) fd.append("signature_name", diarySign.trim());
                      if (diaryFile) fd.append("correspondence", diaryFile);
                      await api.saveInvoiceDiary(token, selected.id, fd);
                      await load();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Could not save note");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Add Note
                </button>
              </section>
              <section className="panel nested">
                <h3>Uploaded Document</h3>
                {docPreview ? (
                  <iframe
                    title="Uploaded document"
                    className="billing-doc-frame"
                    src={mediaUrl(docPreview)}
                  />
                ) : (
                  <p className="muted">No document uploaded yet.</p>
                )}
                <label style={{ display: "block", marginTop: "0.75rem" }}>
                  Upload Correspondence
                  <input
                    type="file"
                    accept="application/pdf,.pdf,image/*"
                    onChange={(e) => setDiaryFile(e.target.files?.[0] || null)}
                  />
                </label>
                {selected.invoice_pdf_path ? (
                  <p>
                    <a href={mediaUrl(selected.invoice_pdf_path)} target="_blank" rel="noreferrer">
                      Open invoice PDF
                    </a>
                  </p>
                ) : null}
              </section>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button
                className="btn"
                type="button"
                disabled={busy || (diaryOpen !== "view" && diaryNote.trim().length < 2)}
                onClick={async () => {
                  if (!token || !selected) return;
                  setBusy(true);
                  try {
                    if (diaryNote.trim().length >= 2 || diaryFile) {
                      const fd = new FormData();
                      fd.append("note", diaryNote.trim() || "Document correspondence updated");
                      if (diarySign.trim()) fd.append("signature_name", diarySign.trim());
                      if (diaryFile) fd.append("correspondence", diaryFile);
                      await api.saveInvoiceDiary(token, selected.id, fd);
                    }
                    if (diaryOpen === "clarify") {
                      await api.submitInvoiceClarification(token, selected.id, {
                        note: diaryNote.trim() || "Clarification submitted",
                      });
                    } else if (diaryOpen === "withdraw") {
                      await api.withdrawInvoice(token, selected.id, {
                        note: diaryNote.trim() || "Withdrawn",
                      });
                    }
                    setDiaryOpen("none");
                    setDiaryFile(null);
                    await load();
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "Diary failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Submit
              </button>
              <button className="btn danger" type="button" onClick={() => setDiaryOpen("none")}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
