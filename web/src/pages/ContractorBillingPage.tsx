import { FormEvent, useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { Invoice, Project } from "../types";

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "0.00";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ContractorBillingPage() {
  const { token, fullName, role, isReadonly } = useAuth();
  const canEdit = role === "contractor" && !isReadonly;
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState("Stage Payment Statement for Works");
  const [thisBill, setThisBill] = useState("");
  const [cumulative, setCumulative] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [billFrom, setBillFrom] = useState("");
  const [billTo, setBillTo] = useState("");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);

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
    if (el) el.textContent = "Contractor — Invoice upload";
    void load();
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canEdit) return;
    if (!projectId || !invoiceNo.trim() || !thisBill) {
      setError("Project, invoice no and This bill Amount are required");
      return;
    }
    const contractN = Number(contractAmount);
    const cumulativeN = Number(cumulative || thisBill);
    if (
      contractAmount &&
      Number.isFinite(contractN) &&
      Number.isFinite(cumulativeN) &&
      cumulativeN > contractN
    ) {
      window.alert(
        "Contract Amount thi vadhare Amount nai nakhi sako.\n\nCumulative Payment cannot be greater than Contract Amount."
      );
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
      setMsg(`Invoice ${created.transaction_id} submitted`);
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Contractor invoice upload</h1>
          <p>
            Contractor fills This bill Amount, Cumulative up to date, and uploads the bill PDF. GMC MIS
            Expert and NHIPMPL can view the same records.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      {canEdit ? (
        <form className="card soi-sheet" onSubmit={onSubmit}>
          <div className="soi-header">
            <div>
              <strong>Invoice claim</strong>
              <div className="muted">{fullName}</div>
            </div>
          </div>
          <div className="soi-meta">
            <label>
              Project
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
              Invoice no
              <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} required />
            </label>
            <label>
              Invoice date
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </label>
            <label>
              Payment type
              <input value={paymentType} onChange={(e) => setPaymentType(e.target.value)} />
            </label>
            <label>
              Contract Amount ₹
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
              This bill Amount ₹
              <input
                type="number"
                min="0"
                step="0.01"
                value={thisBill}
                onChange={(e) => setThisBill(e.target.value)}
                required
              />
            </label>
            <label>
              Cumulative up to the date amount ₹
              <input
                type="number"
                min="0"
                step="0.01"
                value={cumulative}
                onChange={(e) => {
                  const next = e.target.value;
                  const contractN = Number(contractAmount);
                  const cumulativeN = Number(next);
                  if (
                    contractAmount &&
                    next &&
                    Number.isFinite(contractN) &&
                    Number.isFinite(cumulativeN) &&
                    cumulativeN > contractN
                  ) {
                    window.alert(
                      "Contract Amount thi vadhare Amount nai nakhi sako.\n\nCumulative Payment cannot be greater than Contract Amount."
                    );
                    return;
                  }
                  setCumulative(next);
                }}
              />
            </label>
            <label>
              Bill from
              <input type="date" value={billFrom} onChange={(e) => setBillFrom(e.target.value)} />
            </label>
            <label>
              Bill to
              <input type="date" value={billTo} onChange={(e) => setBillTo(e.target.value)} />
            </label>
            <label className="span-2">
              Bill upload (PDF)
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdf(e.target.files?.[0] || null)}
              />
            </label>
            <label className="span-2">
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="soi-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit invoice"}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">View only — contractor submits invoices from this screen.</p>
      )}

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Submitted invoices</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Txn</th>
              <th>Invoice</th>
              <th>This bill</th>
              <th>Cumulative</th>
              <th>Status</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.transaction_id}</td>
                <td>{inv.invoice_no}</td>
                <td>₹ {money(inv.this_bill_amount ?? inv.amount)}</td>
                <td>₹ {money(inv.cumulative_amount)}</td>
                <td>{inv.status_detail || inv.status}</td>
                <td>
                  {inv.invoice_pdf_path ? (
                    <a href={mediaUrl(inv.invoice_pdf_path)} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
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
    </div>
  );
}
