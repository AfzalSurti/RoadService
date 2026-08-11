import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";
import type { Invoice, Project } from "../types";

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

export function BillingPage() {
  const { token, role, isReadonly } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    project_id: "",
    invoice_no: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_type: "Stage Payment Statement for Works",
    amount: "",
    chainage_from: "",
    chainage_to: "",
    piu: "",
    faro: "",
    bill_from: "",
    bill_to: "",
    notes: "",
  });
  const [recommend, setRecommend] = useState({
    payment_mode: "full",
    recommended_amount: "",
    calculation_note: "",
    note: "",
  });
  const [approve, setApprove] = useState({ upc: "", note: "", approved_amount: "", voucher_no: "" });
  const [actionNote, setActionNote] = useState("");

  const load = async () => {
    if (!token) return;
    try {
      const [inv, proj] = await Promise.all([api.invoices(token), api.projects(token)]);
      setInvoices(inv);
      setProjects(proj);
      setError(null);
      if (selected) {
        const fresh = inv.find((i) => i.id === selected.id) || null;
        setSelected(fresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load billing");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Contractor — Invoice Processing";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const counts = useMemo(() => {
    return {
      pending: invoices.filter((i) => i.status === "submitted" || i.status === "recommended").length,
      approve: invoices.filter((i) => i.status === "approved").length,
      reject: invoices.filter((i) => i.status === "rejected").length,
      clarify: invoices.filter((i) => i.status === "clarification").length,
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (!matchesFilter(inv, filter)) return false;
      if (!q) return true;
      const project = projects.find((p) => p.id === inv.project_id)?.name || "";
      return [
        inv.transaction_id,
        inv.invoice_no,
        inv.upc,
        inv.piu,
        inv.faro,
        inv.payment_type,
        inv.status_detail,
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

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    setBusy(true);
    setError(null);
    try {
      await api.createInvoice(token, {
        project_id: Number(form.project_id),
        invoice_no: form.invoice_no.trim(),
        invoice_date: form.invoice_date,
        payment_type: form.payment_type.trim(),
        amount: Number(form.amount),
        chainage_from: form.chainage_from || undefined,
        chainage_to: form.chainage_to || undefined,
        notes: form.notes || undefined,
        piu: form.piu || undefined,
        faro: form.faro || undefined,
        bill_from: form.bill_from || undefined,
        bill_to: form.bill_to || undefined,
      });
      setShowCreate(false);
      setForm({
        project_id: "",
        invoice_no: "",
        invoice_date: new Date().toISOString().slice(0, 10),
        payment_type: "Stage Payment Statement for Works",
        amount: "",
        chainage_from: "",
        chainage_to: "",
        piu: "",
        faro: "",
        bill_from: "",
        bill_to: "",
        notes: "",
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

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

  const exportExcel = () => {
    const headers = [
      "Transaction ID",
      "UPC",
      "PIU",
      "FARO",
      "Payment Type",
      "Invoice No",
      "Invoice Date",
      "Amount",
      "Submission Date",
      "Bill From",
      "Bill To",
      "Recommended AE/IE",
      "Recommended PIU",
      "Net Released",
      "Status",
      "Voucher",
    ];
    const lines = filtered.map((inv) =>
      [
        inv.transaction_id,
        inv.upc || "",
        inv.piu || "",
        inv.faro || "",
        inv.payment_type,
        inv.invoice_no,
        inv.invoice_date,
        inv.amount,
        inv.created_at,
        inv.bill_from || "",
        inv.bill_to || "",
        inv.recommended_ae_amount ?? "",
        inv.recommended_piu_amount ?? "",
        inv.net_amount_released ?? "",
        inv.status_detail || inv.status,
        inv.voucher_no || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "invoices.csv";
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
            <td>${inv.upc || "—"}</td>
          </tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>Invoices</title>
      <style>body{font-family:Arial;padding:16px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#eee}</style></head>
      <body><h2>Contractor Invoice Processing</h2>
      <table><thead><tr><th>Txn</th><th>Invoice</th><th>Amount</th><th>Status</th><th>UPC</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=5>No rows</td></tr>"}</tbody></table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="billing-toolbar">
        <div>
          <div className="muted">Home / Finance / Contractor — Invoice Processing</div>
          <h2 style={{ margin: "0.2rem 0 0" }}>Invoice Processing</h2>
        </div>
        <div className="btn-row">
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
                <th>View</th>
                <th>Current Status of Invoice</th>
                <th>Transaction ID</th>
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
                <th>Final bill PDF</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((inv) => (
                <tr key={inv.id} className={selected?.id === inv.id ? "selected-row" : undefined}>
                  <td>
                    <button type="button" className="btn ghost" onClick={() => setSelected(inv)}>
                      View
                    </button>
                  </td>
                  <td>{inv.status_detail || formatLabel(inv.status)}</td>
                  <td>{inv.transaction_id}</td>
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
                    {inv.final_bill_pdf_path ? (
                      <a href={mediaUrl(inv.final_bill_pdf_path)} target="_blank" rel="noreferrer">
                        Open PDF
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={15}>No invoices yet.</td>
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

      {selected ? (
        <section className="panel">
          <div className="panel-head-row">
            <h2>
              {selected.transaction_id} · {selected.invoice_no}
            </h2>
            <button type="button" className="linkish" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="muted">{selected.status_detail}</p>
          <div className="detail-grid">
            <div>
              <strong>Status</strong>
              <div>{formatLabel(selected.status)}</div>
            </div>
            <div>
              <strong>Payment type</strong>
              <div>{selected.payment_type}</div>
            </div>
            <div>
              <strong>This bill / Cumulative</strong>
              <div>
                ₹ {money(selected.this_bill_amount ?? selected.amount)} / ₹ {money(selected.cumulative_amount)}
              </div>
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
              <strong>Recommended Amount By NHIPMPL</strong>
              <div>₹ {money(selected.recommended_piu_amount ?? selected.recommended_amount)}</div>
            </div>
            <div>
              <strong>Net released</strong>
              <div>₹ {money(selected.net_amount_released ?? selected.approved_amount)}</div>
            </div>
            <div>
              <strong>Voucher</strong>
              <div>{selected.voucher_no || "—"}</div>
            </div>
            <div>
              <strong>Bill duration</strong>
              <div>
                {fmtDate(selected.bill_from)} → {fmtDate(selected.bill_to)}
              </div>
            </div>
          </div>

          {(role === "admin" || role === "government") && !isReadonly ? (
            <label style={{ display: "block", marginTop: "1rem" }}>
              Upload final bill (PDF)
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !token) return;
                  await run(() => api.uploadFinalBill(token, selected.id, file));
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
          {selected.invoice_pdf_path ? (
            <p>
              Invoice PDF:{" "}
              <a href={mediaUrl(selected.invoice_pdf_path)} target="_blank" rel="noreferrer">
                Open
              </a>
            </p>
          ) : null}

          <h3 style={{ marginTop: "1.25rem" }}>Activity</h3>
          <ul className="activity-list">
            {(selected.activities || []).map((a) => (
              <li key={a.id}>
                <strong>{formatLabel(a.action)}</strong>
                {a.note ? ` — ${a.note}` : ""}
                <span className="muted"> · {new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
            {!selected.activities?.length ? <li className="muted">No activity yet.</li> : null}
          </ul>

          {!isReadonly ? (
            <div className="action-stack" style={{ marginTop: "1rem" }}>
              {role === "admin" &&
              (selected.status === "submitted" || selected.status === "clarification") ? (
                <div className="panel nested">
                  <h3>Recommend payment (GMC)</h3>
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
                      UPC
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
                      Accept (UPC)
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.seekInvoiceClarification(token, selected.id, {
                            note: approve.note || "Clarification required",
                          })
                        )
                      }
                    >
                      Seek clarification
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.rejectInvoice(token, selected.id, {
                            note: approve.note || "Rejected",
                          })
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}

              {(role === "admin" || role === "contractor") && selected.status === "clarification" ? (
                <div className="btn-row">
                  <input
                    placeholder="Clarification reply"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      token &&
                      run(() =>
                        api.submitInvoiceClarification(token, selected.id, {
                          note: actionNote || "Clarification submitted",
                        })
                      )
                    }
                  >
                    Submit clarification
                  </button>
                </div>
              ) : null}

              {(role === "admin" || role === "contractor") &&
              (selected.status === "submitted" || selected.status === "clarification") ? (
                <button
                  type="button"
                  className="linkish"
                  disabled={busy}
                  onClick={() =>
                    token &&
                    run(() => api.withdrawInvoice(token, selected.id, { note: "Withdrawn by user" }))
                  }
                >
                  Withdraw invoice
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {showCreate ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onCreate}>
            <h2>New invoice</h2>
            <div className="form-grid">
              <label>
                Project
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Invoice no
                <input
                  required
                  value={form.invoice_no}
                  onChange={(e) => setForm({ ...form, invoice_no: e.target.value })}
                />
              </label>
              <label>
                Invoice date
                <input
                  type="date"
                  required
                  value={form.invoice_date}
                  onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                />
              </label>
              <label>
                Payment type
                <input
                  required
                  value={form.payment_type}
                  onChange={(e) => setForm({ ...form, payment_type: e.target.value })}
                />
              </label>
              <label>
                Amount ₹
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </label>
              <label>
                PIU
                <input value={form.piu} onChange={(e) => setForm({ ...form, piu: e.target.value })} />
              </label>
              <label>
                FARO / RO
                <input value={form.faro} onChange={(e) => setForm({ ...form, faro: e.target.value })} />
              </label>
              <label>
                Bill from
                <input
                  type="date"
                  value={form.bill_from}
                  onChange={(e) => setForm({ ...form, bill_from: e.target.value })}
                />
              </label>
              <label>
                Bill to
                <input
                  type="date"
                  value={form.bill_to}
                  onChange={(e) => setForm({ ...form, bill_to: e.target.value })}
                />
              </label>
              <label>
                Chainage from
                <input
                  value={form.chainage_from}
                  onChange={(e) => setForm({ ...form, chainage_from: e.target.value })}
                />
              </label>
              <label>
                Chainage to
                <input
                  value={form.chainage_to}
                  onChange={(e) => setForm({ ...form, chainage_to: e.target.value })}
                />
              </label>
              <label className="span-2">
                Notes / diary
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>
                Submit invoice
              </button>
              <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
