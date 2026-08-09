import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";
import type { Invoice, Project } from "../types";

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BillingPage() {
  const { token, role, isReadonly } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    project_id: "",
    invoice_no: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    payment_type: "Running Account Bill",
    amount: "",
    chainage_from: "",
    chainage_to: "",
    notes: "",
  });
  const [recommend, setRecommend] = useState({
    payment_mode: "full",
    recommended_amount: "",
    calculation_note: "",
    note: "",
  });
  const [approve, setApprove] = useState({ upc: "", note: "", approved_amount: "" });
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
    if (el) el.textContent = "Billing";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const inv of invoices) c[inv.status] = (c[inv.status] || 0) + 1;
    return c;
  }, [invoices]);

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
      });
      setShowCreate(false);
      setForm({
        project_id: "",
        invoice_no: "",
        invoice_date: new Date().toISOString().slice(0, 10),
        payment_type: "Running Account Bill",
        amount: "",
        chainage_from: "",
        chainage_to: "",
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

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <section className="stat-grid">
        {["submitted", "recommended", "clarification", "approved", "rejected", "withdrawn"].map((s) => (
          <article className="stat" key={s}>
            <span>{formatLabel(s)}</span>
            <strong>{counts[s] || 0}</strong>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head-row">
          <h2>Invoices</h2>
          {(role === "admin" || role === "contractor") && !isReadonly ? (
            <button className="btn" type="button" onClick={() => setShowCreate(true)}>
              New invoice
            </button>
          ) : null}
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Txn</th>
              <th>Invoice</th>
              <th>Project</th>
              <th>Amount ₹</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className={selected?.id === inv.id ? "selected-row" : undefined}>
                <td>{inv.transaction_id}</td>
                <td>
                  {inv.invoice_no}
                  <div className="muted">{inv.invoice_date}</div>
                </td>
                <td>{projects.find((p) => p.id === inv.project_id)?.name || `#${inv.project_id}`}</td>
                <td>{money(inv.amount)}</td>
                <td>
                  <span className={`badge status-${inv.status}`}>{formatLabel(inv.status)}</span>
                </td>
                <td>
                  <button type="button" className="linkish" onClick={() => setSelected(inv)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!invoices.length ? (
              <tr>
                <td colSpan={6}>No invoices yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
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
              <strong>Mode</strong>
              <div>{formatLabel(selected.payment_mode)}</div>
            </div>
            <div>
              <strong>Amount</strong>
              <div>₹ {money(selected.amount)}</div>
            </div>
            <div>
              <strong>Recommended</strong>
              <div>₹ {money(selected.recommended_amount)}</div>
            </div>
            <div>
              <strong>Approved</strong>
              <div>₹ {money(selected.approved_amount)}</div>
            </div>
            <div>
              <strong>UPC</strong>
              <div>{selected.upc || "—"}</div>
            </div>
            <div>
              <strong>Chainage</strong>
              <div>
                {selected.chainage_from || "—"} → {selected.chainage_to || "—"}
              </div>
            </div>
          </div>
          {selected.notes ? <p className="muted">{selected.notes}</p> : null}
          {selected.calculation_json ? (
            <p>
              <strong>Calculation note:</strong> {selected.calculation_json}
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
                  <h3>Recommend payment</h3>
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
                    <label className="span-2">
                      Remark
                      <input
                        value={recommend.note}
                        onChange={(e) => setRecommend({ ...recommend, note: e.target.value })}
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
                  <h3>Client decision</h3>
                  <div className="form-grid">
                    <label>
                      UPC
                      <input
                        value={approve.upc}
                        onChange={(e) => setApprove({ ...approve, upc: e.target.value })}
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
                    <label className="span-2">
                      Note
                      <input
                        value={approve.note}
                        onChange={(e) => setApprove({ ...approve, note: e.target.value })}
                      />
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
                            note: approve.note || actionNote || "Clarification required",
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
                            note: approve.note || actionNote || "Rejected",
                          })
                        )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}

              {(role === "admin" || role === "government") &&
              selected.status !== "approved" &&
              selected.status !== "rejected" &&
              selected.status !== "withdrawn" ? (
                <div className="btn-row">
                  <input
                    placeholder="Action note"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  {role === "admin" ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        token &&
                        run(() =>
                          api.seekInvoiceClarification(token, selected.id, {
                            note: actionNote || "Clarification required",
                          })
                        )
                      }
                    >
                      Seek clarification
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn danger"
                    disabled={busy}
                    onClick={() =>
                      token &&
                      run(() =>
                        api.rejectInvoice(token, selected.id, { note: actionNote || "Rejected" })
                      )
                    }
                  >
                    Reject
                  </button>
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
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onCreate}
          >
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
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
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
