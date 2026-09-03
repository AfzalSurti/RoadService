import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { Invoice, Project } from "../types";

const PAYMENT_TYPES = [
  "Stage Payment Statement for Works",
  "IPC (Interim Payment Certificate)",
  "Other",
  "Mobilisation Advance",
  "Price Adjustment",
  "Final Bill",
];

const GMC_LABEL: Record<string, string> = {
  pending: "Awaiting GMC review",
  approved: "Approved by GMC · at NHIPMPL",
  not_approved: "Not approved by GMC",
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "0.00";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB");
}

export function ContractorBillingPage() {
  const { token, fullName, role, isReadonly } = useAuth();
  const canEdit = role === "contractor" && !isReadonly;
  const canReview = role === "admin" && !isReadonly;

  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [gmcFilter, setGmcFilter] = useState<"all" | "pending" | "approved" | "not_approved">("all");

  const [showCreate, setShowCreate] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[0]);
  const [thisBill, setThisBill] = useState("");
  const [cumulative, setCumulative] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [billFrom, setBillFrom] = useState("");
  const [billTo, setBillTo] = useState("");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);

  const [reviewInv, setReviewInv] = useState<Invoice | null>(null);
  const [reviewRemark, setReviewRemark] = useState("");

  const load = async () => {
    if (!token) return;
    try {
      const [inv, proj] = await Promise.all([api.invoices(token), api.projects(token)]);
      setInvoices(inv);
      setProjects(proj);
      if (!projectId && proj[0]) setProjectId(String(proj[0].id));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Contractor Billing";
    void load();
  }, [token]);

  const projectName = (id: number) => projects.find((p) => p.id === id)?.name || `#${id}`;

  const counts = useMemo(
    () => ({
      pending: invoices.filter((i) => (i.gmc_review_status || "approved") === "pending").length,
      approved: invoices.filter((i) => (i.gmc_review_status || "approved") === "approved").length,
      not_approved: invoices.filter((i) => (i.gmc_review_status || "approved") === "not_approved").length,
    }),
    [invoices]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const gmc = inv.gmc_review_status || "approved";
      if (gmcFilter !== "all" && gmc !== gmcFilter) return false;
      if (!q) return true;
      return [inv.transaction_id, inv.invoice_no, inv.contractor_name, inv.payment_type, inv.status_detail]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [invoices, search, gmcFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [search, pageSize, gmcFilter]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canEdit) return;
    if (!projectId || !invoiceNo.trim() || !thisBill) {
      setError("Project, invoice no and Invoice Absolute Amount are required");
      return;
    }
    const contractN = Number(contractAmount);
    const cumulativeN = Number(cumulative || thisBill);
    if (contractAmount && Number.isFinite(contractN) && Number.isFinite(cumulativeN) && cumulativeN > contractN) {
      window.alert("Cumulative Payment cannot be greater than Contract Amount.");
      setError("Cumulative Payment cannot exceed Contract Amount");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("project_id", projectId);
      fd.append("invoice_no", invoiceNo.trim());
      fd.append("invoice_date", invoiceDate);
      fd.append("payment_type", paymentType);
      fd.append("this_bill_amount", thisBill);
      fd.append("cumulative_amount", cumulative || thisBill);
      if (contractAmount) fd.append("contract_amount_cr", contractAmount);
      if (billFrom) fd.append("bill_from", billFrom);
      if (billTo) fd.append("bill_to", billTo);
      if (notes.trim()) fd.append("notes", notes.trim());
      if (pdf) fd.append("bill_pdf", pdf);
      const created = await api.createInvoiceClaim(token, fd);
      setMsg(`Invoice ${created.transaction_id} submitted — awaiting GMC MIS Expert review.`);
      setShowCreate(false);
      setInvoiceNo("");
      setThisBill("");
      setCumulative("");
      setContractAmount("");
      setNotes("");
      setPdf(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (status: "approved" | "not_approved") => {
    if (!token || !canReview || !reviewInv) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.gmcReviewInvoice(token, reviewInv.id, status, reviewRemark.trim());
      setMsg(
        status === "approved"
          ? `Invoice ${reviewInv.transaction_id} approved and forwarded to NHIPMPL.`
          : `Invoice ${reviewInv.transaction_id} marked not approved.`
      );
      setReviewInv(null);
      setReviewRemark("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    const headers = [
      "Transaction ID",
      "Contractor",
      "Project",
      "Payment Type",
      "Invoice No",
      "Invoice Date",
      "Invoice Amount (INR)",
      "Cumulative (INR)",
      "GMC Review",
      "GMC Remark",
    ];
    const lines = filtered.map((inv) =>
      [
        inv.transaction_id,
        inv.contractor_name || "",
        projectName(inv.project_id),
        inv.payment_type,
        inv.invoice_no,
        inv.invoice_date,
        inv.this_bill_amount ?? inv.amount,
        inv.cumulative_amount ?? "",
        GMC_LABEL[inv.gmc_review_status || "approved"] || inv.gmc_review_status,
        inv.gmc_remark || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contractor_billing.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = filtered
      .map(
        (inv) => `<tr>
          <td>${inv.transaction_id}</td><td>${inv.contractor_name || "—"}</td>
          <td>${inv.invoice_no}</td><td>${money(inv.this_bill_amount ?? inv.amount)}</td>
          <td>${GMC_LABEL[inv.gmc_review_status || "approved"] || ""}</td>
          <td>${inv.gmc_remark || "—"}</td></tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Contractor Billing</title>
      <style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#eee}</style></head>
      <body><h2>Contractor Billing</h2>
      <table><thead><tr><th>Txn</th><th>Contractor</th><th>Invoice</th><th>Amount</th><th>GMC Review</th><th>Remark</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=6>No rows</td></tr>"}</tbody></table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <div className="billing-toolbar">
        <div>
          <div className="muted">Home / Finance / Contractor Billing</div>
          <h2 style={{ margin: "0.2rem 0 0" }}>Contractor Billing</h2>
          <p className="muted" style={{ margin: "0.35rem 0 0", maxWidth: 720 }}>
            Contractor submits the invoice → GMC MIS Expert approves it and records a remark → the
            approved invoice is forwarded to the NHIPMPL portal.
          </p>
        </div>
        <div className="btn-row">
          {canEdit ? (
            <button className="btn" type="button" onClick={() => setShowCreate(true)}>
              New
            </button>
          ) : null}
          <button className="btn secondary" type="button" onClick={() => setGmcFilter("all")}>
            FILTER
          </button>
        </div>
      </div>

      <section className="billing-status-grid">
        <button
          type="button"
          className={`billing-status-card pending${gmcFilter === "pending" ? " active" : ""}`}
          onClick={() => setGmcFilter(gmcFilter === "pending" ? "all" : "pending")}
        >
          <span>PENDING GMC REVIEW</span>
          <strong>{counts.pending}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card approve${gmcFilter === "approved" ? " active" : ""}`}
          onClick={() => setGmcFilter(gmcFilter === "approved" ? "all" : "approved")}
        >
          <span>APPROVED · AT NHIPMPL</span>
          <strong>{counts.approved}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card reject${gmcFilter === "not_approved" ? " active" : ""}`}
          onClick={() => setGmcFilter(gmcFilter === "not_approved" ? "all" : "not_approved")}
        >
          <span>NOT APPROVED</span>
          <strong>{counts.not_approved}</strong>
        </button>
        <button
          type="button"
          className={`billing-status-card clarify${gmcFilter === "all" ? " active" : ""}`}
          onClick={() => setGmcFilter("all")}
        >
          <span>TOTAL</span>
          <strong>{invoices.length}</strong>
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
              placeholder="Txn / invoice no / contractor…"
            />
          </label>
        </div>

        <div className="table-scroll billing-wide-table">
          <table className="data">
            <thead>
              <tr>
                {canReview ? <th>Action</th> : null}
                <th>Current Status of Invoice</th>
                <th>Transaction ID</th>
                <th>Contractor</th>
                <th>Project / Package</th>
                <th>Payment Type</th>
                <th>Invoice No.</th>
                <th>Invoice Date</th>
                <th>Invoice Amount (INR)</th>
                <th>Cumulative (INR)</th>
                <th>Bill Duration From</th>
                <th>Bill Duration To</th>
                <th>Invoice PDF</th>
                <th>GMC Remark</th>
                <th>Reviewed On</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((inv) => {
                const gmc = inv.gmc_review_status || "approved";
                return (
                  <tr key={inv.id}>
                    {canReview ? (
                      <td>
                        {gmc === "pending" ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setReviewInv(inv);
                              setReviewRemark(inv.gmc_remark || "");
                            }}
                          >
                            Review
                          </button>
                        ) : (
                          <span className="muted">Done</span>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <span className={`badge gmc-${gmc}`}>{GMC_LABEL[gmc] || gmc}</span>
                    </td>
                    <td>{inv.transaction_id}</td>
                    <td>{inv.contractor_name || "—"}</td>
                    <td>{projectName(inv.project_id)}</td>
                    <td>{inv.payment_type}</td>
                    <td>{inv.invoice_no}</td>
                    <td>{fmtDate(inv.invoice_date)}</td>
                    <td>{money(inv.this_bill_amount ?? inv.amount)}</td>
                    <td>{money(inv.cumulative_amount)}</td>
                    <td>{fmtDate(inv.bill_from)}</td>
                    <td>{fmtDate(inv.bill_to)}</td>
                    <td>
                      {inv.invoice_pdf_path ? (
                        <a href={mediaUrl(inv.invoice_pdf_path)} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{inv.gmc_remark || "—"}</td>
                    <td>{fmtDate(inv.gmc_reviewed_at)}</td>
                  </tr>
                );
              })}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={canReview ? 15 : 14}>No invoices yet.</td>
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

      {showCreate && canEdit ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} style={{ maxWidth: 920 }}>
            <div className="panel-head-row">
              <h2>Contractor Billing — New claim</h2>
              <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>
                Back to Grid
              </button>
            </div>
            <p className="muted">
              Note: Whenever documents are not required to upload please use common template mentioning that
              &quot;Not Applicable&quot;.
            </p>
            <div className="soi-header">
              <div>
                <strong>Invoice claim</strong>
                <div className="muted">{fullName}</div>
              </div>
            </div>
            <div className="form-grid">
              <label>
                Project / Package
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  <option value="">Select…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contract Amount (Rs. in Cr.)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(e.target.value)}
                  required
                />
              </label>
              <label>
                Cumulative Payment Received Till Date (Rs. in Cr.)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cumulative}
                  onChange={(e) => {
                    const next = e.target.value;
                    const cN = Number(contractAmount);
                    const uN = Number(next);
                    if (contractAmount && next && Number.isFinite(cN) && Number.isFinite(uN) && uN > cN) {
                      window.alert("Cumulative Payment cannot be greater than Contract Amount.");
                      return;
                    }
                    setCumulative(next);
                  }}
                />
              </label>
            </div>
            <h3>Details of payment being claimed now</h3>
            <div className="form-grid">
              <label>
                Invoice Duration From
                <input type="date" value={billFrom} onChange={(e) => setBillFrom(e.target.value)} />
              </label>
              <label>
                Invoice Duration To
                <input type="date" value={billTo} onChange={(e) => setBillTo(e.target.value)} />
              </label>
              <label>
                Payment Type
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                  {PAYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Invoice No.
                <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
              </label>
              <label>
                Invoice Date
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Invoice Absolute Amount [Rs.]
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={thisBill}
                  onChange={(e) => setThisBill(e.target.value)}
                  required
                />
              </label>
              <label className="span-2">
                Upload Invoice
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] || null)}
                />
                <small className="muted">{pdf ? pdf.name : "No file chosen"}</small>
              </label>
              <label className="span-2">
                Notes
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
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

      {reviewInv && canReview ? (
        <div className="modal-backdrop" onClick={() => setReviewInv(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="panel-head-row">
              <h2>GMC review — {reviewInv.transaction_id}</h2>
              <button type="button" className="btn ghost" onClick={() => setReviewInv(null)}>
                Back
              </button>
            </div>
            <div className="detail-grid">
              <div>
                <strong>Contractor</strong>
                <div>{reviewInv.contractor_name || "—"}</div>
              </div>
              <div>
                <strong>Project</strong>
                <div>{projectName(reviewInv.project_id)}</div>
              </div>
              <div>
                <strong>Invoice No.</strong>
                <div>{reviewInv.invoice_no}</div>
              </div>
              <div>
                <strong>Invoice Amount</strong>
                <div>₹ {money(reviewInv.this_bill_amount ?? reviewInv.amount)}</div>
              </div>
              <div>
                <strong>Payment Type</strong>
                <div>{reviewInv.payment_type}</div>
              </div>
              <div>
                <strong>Invoice PDF</strong>
                <div>
                  {reviewInv.invoice_pdf_path ? (
                    <a href={mediaUrl(reviewInv.invoice_pdf_path)} target="_blank" rel="noreferrer">
                      Open PDF
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>
            <label className="span-2" style={{ display: "block", marginTop: "1rem" }}>
              Remark
              <textarea
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
                placeholder="GMC MIS Expert remark (shown to contractor and NHIPMPL)"
                style={{ minHeight: 120, width: "100%" }}
              />
            </label>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="button" disabled={busy} onClick={() => void submitReview("approved")}>
                {busy ? "Saving…" : "Approve & forward to NHIPMPL"}
              </button>
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={() => void submitReview("not_approved")}
              >
                Not approve
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
