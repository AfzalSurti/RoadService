import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Invoice, Project } from "../types";

type LineRow = {
  code: string;
  label: string;
  ae: number;
  piu: number;
  fa: number;
  remarks: string;
};

type Summary = {
  work_done: LineRow[];
  gst: LineRow[];
  advances: LineRow[];
  recoveries: LineRow[];
  withheld_released: LineRow[];
  royalty: LineRow[];
  gst_released: LineRow[];
  others: LineRow[];
  balance_claim_pct: number;
  totals?: Record<string, Record<string, number> | number>;
};

type Col = "ae" | "piu" | "fa";

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "0.00";
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sumCol(rows: LineRow[] | undefined, col: Col) {
  return round2((rows || []).reduce((acc, r) => acc + num(r[col]), 0));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function computeTotals(summary: Summary) {
  const total_work = { ae: sumCol(summary.work_done, "ae"), piu: sumCol(summary.work_done, "piu"), fa: sumCol(summary.work_done, "fa") };
  const total_gst = { ae: sumCol(summary.gst, "ae"), piu: sumCol(summary.gst, "piu"), fa: sumCol(summary.gst, "fa") };
  const total_advances = { ae: sumCol(summary.advances, "ae"), piu: sumCol(summary.advances, "piu"), fa: sumCol(summary.advances, "fa") };
  const total_a = {
    ae: round2(total_work.ae + total_gst.ae + total_advances.ae),
    piu: round2(total_work.piu + total_gst.piu + total_advances.piu),
    fa: round2(total_work.fa + total_gst.fa + total_advances.fa),
  };
  const total_b = { ae: sumCol(summary.recoveries, "ae"), piu: sumCol(summary.recoveries, "piu"), fa: sumCol(summary.recoveries, "fa") };
  const total_c = {
    ae: round2(total_a.ae - total_b.ae),
    piu: round2(total_a.piu - total_b.piu),
    fa: round2(total_a.fa - total_b.fa),
  };
  const total_d = { ae: sumCol(summary.withheld_released, "ae"), piu: sumCol(summary.withheld_released, "piu"), fa: sumCol(summary.withheld_released, "fa") };
  const total_e = { ae: sumCol(summary.royalty, "ae"), piu: sumCol(summary.royalty, "piu"), fa: sumCol(summary.royalty, "fa") };
  const total_f = { ae: sumCol(summary.gst_released, "ae"), piu: sumCol(summary.gst_released, "piu"), fa: sumCol(summary.gst_released, "fa") };
  const total_g = { ae: sumCol(summary.others, "ae"), piu: sumCol(summary.others, "piu"), fa: sumCol(summary.others, "fa") };
  const total_payable = {
    ae: round2(total_c.ae + total_d.ae + total_e.ae + total_f.ae + total_g.ae),
    piu: round2(total_c.piu + total_d.piu + total_e.piu + total_f.piu + total_g.piu),
    fa: round2(total_c.fa + total_d.fa + total_e.fa + total_f.fa + total_g.fa),
  };
  const pct = num(summary.balance_claim_pct);
  const balance_claim = {
    ae: round2((total_payable.ae * pct) / 100),
    piu: round2((total_payable.piu * pct) / 100),
    fa: round2((total_payable.fa * pct) / 100),
  };
  return {
    total_work,
    total_gst,
    total_advances,
    total_a,
    total_b,
    total_c,
    total_d,
    total_e,
    total_f,
    total_g,
    total_payable,
    balance_claim,
    absolute_amount: total_payable.ae,
  };
}

function asSummary(raw: Record<string, unknown> | null | undefined): Summary {
  const s = (raw || {}) as Partial<Summary>;
  return {
    work_done: (s.work_done || []) as LineRow[],
    gst: (s.gst || []) as LineRow[],
    advances: (s.advances || []) as LineRow[],
    recoveries: (s.recoveries || []) as LineRow[],
    withheld_released: (s.withheld_released || []) as LineRow[],
    royalty: (s.royalty || []) as LineRow[],
    gst_released: (s.gst_released || []) as LineRow[],
    others: (s.others || []) as LineRow[],
    balance_claim_pct: num(s.balance_claim_pct ?? 10),
    totals: s.totals as Summary["totals"],
  };
}

export function ContractorBillingPage() {
  const { token, fullName, role, isReadonly } = useAuth();
  const canEdit = (role === "contractor" || role === "admin") && !isReadonly;
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<"list" | "edit" | "create">("list");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [projectId, setProjectId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectTitle, setProjectTitle] = useState("");
  const [authorityEngineer, setAuthorityEngineer] = useState("");
  const [contractorName, setContractorName] = useState(fullName || "");
  const [contractPrice, setContractPrice] = useState("");
  const [signatureName, setSignatureName] = useState(fullName || "");
  const [summary, setSummary] = useState<Summary | null>(null);

  const totals = useMemo(() => (summary ? computeTotals(summary) : null), [summary]);

  const load = async () => {
    if (!token) return;
    try {
      const [inv, proj] = await Promise.all([api.invoices(token), api.projects(token)]);
      setInvoices(inv);
      setProjects(proj);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    void load();
  }, [token]);

  const openCreate = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const tpl = await api.billingSummaryTemplate(token);
      setSummary(asSummary(tpl));
      setSelectedId(null);
      setInvoiceNo(`RA-${Date.now().toString().slice(-6)}`);
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setProjectTitle(projects[0]?.name || "");
      setProjectId(projects[0] ? String(projects[0].id) : "");
      setAuthorityEngineer("");
      setContractorName(fullName || "");
      setContractPrice("");
      setSignatureName(fullName || "");
      setMode("create");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load template");
    } finally {
      setBusy(false);
    }
  };

  const openInvoice = (inv: Invoice) => {
    setSelectedId(inv.id);
    setInvoiceNo(inv.invoice_no);
    setInvoiceDate(String(inv.invoice_date).slice(0, 10));
    setProjectId(String(inv.project_id));
    setProjectTitle(inv.project_title || projects.find((p) => p.id === inv.project_id)?.name || "");
    setAuthorityEngineer(inv.authority_engineer || "");
    setContractorName(inv.contractor_name || fullName || "");
    setContractPrice(inv.contract_price != null ? String(inv.contract_price) : "");
    setSignatureName(inv.signature_name || fullName || "");
    setSummary(asSummary(inv.summary as Record<string, unknown> | null));
    setMode("edit");
    setMsg(null);
    setError(null);
  };

  const setLine = (section: keyof Summary, index: number, col: Col | "remarks", value: string) => {
    setSummary((prev) => {
      if (!prev) return prev;
      const rows = [...(prev[section] as LineRow[])];
      const row = { ...rows[index] };
      if (col === "remarks") row.remarks = value;
      else row[col] = num(value);
      rows[index] = row;
      return { ...prev, [section]: rows };
    });
  };

  const copyAeToPiuFa = () => {
    setSummary((prev) => {
      if (!prev) return prev;
      const copySection = (rows: LineRow[]) =>
        rows.map((r) => ({ ...r, piu: r.ae, fa: r.ae }));
      return {
        ...prev,
        work_done: copySection(prev.work_done),
        gst: copySection(prev.gst),
        advances: copySection(prev.advances),
        recoveries: copySection(prev.recoveries),
        withheld_released: copySection(prev.withheld_released),
        royalty: copySection(prev.royalty),
        gst_released: copySection(prev.gst_released),
        others: copySection(prev.others),
      };
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !summary || !totals || !canEdit) return;
    const pid = Number(projectId);
    if (!pid) {
      setError("Select a project");
      return;
    }
    const amount = Math.max(totals.absolute_amount, 0.01);
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (mode === "create") {
        const created = await api.createInvoice(token, {
          project_id: pid,
          invoice_no: invoiceNo.trim(),
          invoice_date: invoiceDate,
          payment_type: "Stage Payment Statement for Works",
          amount,
          project_title: projectTitle || undefined,
          authority_engineer: authorityEngineer || undefined,
          contractor_name: contractorName || undefined,
          contract_price: contractPrice ? Number(contractPrice) : undefined,
          summary: summary as unknown as Record<string, unknown>,
          signature_name: signatureName || undefined,
        });
        setMsg(`Invoice ${created.transaction_id} submitted`);
        await load();
        openInvoice(created);
      } else if (selectedId) {
        const updated = await api.updateInvoiceSummary(token, selectedId, {
          project_title: projectTitle || undefined,
          authority_engineer: authorityEngineer || undefined,
          contractor_name: contractorName || undefined,
          contract_price: contractPrice ? Number(contractPrice) : undefined,
          summary: summary as unknown as Record<string, unknown>,
          signature_name: signatureName || undefined,
          amount,
        });
        setMsg("Summary of Invoice saved");
        await load();
        openInvoice(updated);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const renderRows = (section: keyof Summary, title: string, totalKey?: keyof ReturnType<typeof computeTotals>) => {
    if (!summary) return null;
    const rows = summary[section] as LineRow[];
    return (
      <>
        <tr className="soi-section">
          <td colSpan={6}>
            <strong>{title}</strong>
          </td>
        </tr>
        {rows.map((row, idx) => (
          <tr key={row.code}>
            <td className="sr">{row.code.replace(/^[A-Za-z]+/, "") || row.code}</td>
            <td className="desc">{row.label}</td>
            {(["ae", "piu", "fa"] as Col[]).map((col) => (
              <td key={col}>
                {canEdit && mode !== "list" ? (
                  <input
                    type="number"
                    step="0.01"
                    value={row[col]}
                    onChange={(ev) => setLine(section, idx, col, ev.target.value)}
                  />
                ) : (
                  <span className="num">{money(row[col])}</span>
                )}
              </td>
            ))}
            <td>
              {canEdit && mode !== "list" ? (
                <input value={row.remarks} onChange={(ev) => setLine(section, idx, "remarks", ev.target.value)} />
              ) : (
                row.remarks || "—"
              )}
            </td>
          </tr>
        ))}
        {totalKey && totals ? (
          <tr className="soi-total">
            <td />
            <td>
              <strong>Total</strong>
            </td>
            {(["ae", "piu", "fa"] as Col[]).map((col) => (
              <td key={col} className="num">
                <strong>{money((totals[totalKey] as Record<string, number>)[col])}</strong>
              </td>
            ))}
            <td />
          </tr>
        ) : null}
      </>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Contractor Billing</h1>
          <p>NHAI Summary of Invoice — demands, GST, recoveries, and payable amount (AE/IE · PIU · FA-PIU).</p>
        </div>
        <div className="page-actions">
          {mode !== "list" ? (
            <button type="button" className="secondary" onClick={() => setMode("list")}>
              Back to list
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" onClick={() => void openCreate()} disabled={busy}>
              New Summary of Invoice
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {msg ? <p className="ok">{msg}</p> : null}

      {mode === "list" ? (
        <section className="card">
          <h2>My invoices</h2>
          {!invoices.length ? <p className="muted">No invoices yet. Create a Summary of Invoice to start.</p> : null}
          <div className="soi-list">
            {invoices.map((inv) => (
              <button
                key={inv.id}
                type="button"
                className={`soi-list-item${selectedId === inv.id ? " active" : ""}`}
                onClick={() => openInvoice(inv)}
              >
                <div>
                  <strong>{inv.transaction_id}</strong>
                  <div className="muted">
                    {inv.invoice_no} · {inv.project_title || `Project #${inv.project_id}`} · {inv.status}
                  </div>
                </div>
                <strong>₹ {money(inv.amount)}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mode !== "list" && summary && totals ? (
        <form className="card soi-sheet" onSubmit={onSubmit}>
          <div className="soi-header">
            <div>
              <strong>National Highways Authority of India</strong>
              <div className="muted">SUMMARY OF INVOICE</div>
            </div>
            <div className="muted" style={{ textAlign: "right" }}>
              {mode === "edit" && selectedId
                ? invoices.find((i) => i.id === selectedId)?.transaction_id || "—"
                : "New transaction on save"}
            </div>
          </div>

          <div className="soi-meta">
            <label>
              Project
              <select
                value={projectId}
                disabled={mode === "edit" || !canEdit}
                onChange={(ev) => {
                  setProjectId(ev.target.value);
                  const p = projects.find((x) => String(x.id) === ev.target.value);
                  if (p) setProjectTitle(p.name);
                }}
                required
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Invoice No.
              <input
                value={invoiceNo}
                disabled={mode === "edit" || !canEdit}
                onChange={(ev) => setInvoiceNo(ev.target.value)}
                required
              />
            </label>
            <label>
              Project Title
              <input value={projectTitle} disabled={!canEdit} onChange={(ev) => setProjectTitle(ev.target.value)} />
            </label>
            <label>
              Date
              <input
                type="date"
                value={invoiceDate}
                disabled={mode === "edit" || !canEdit}
                onChange={(ev) => setInvoiceDate(ev.target.value)}
                required
              />
            </label>
            <label>
              Authority Engineer / Independent Engineer
              <input
                value={authorityEngineer}
                disabled={!canEdit}
                onChange={(ev) => setAuthorityEngineer(ev.target.value)}
              />
            </label>
            <label>
              Contractor
              <input value={contractorName} disabled={!canEdit} onChange={(ev) => setContractorName(ev.target.value)} />
            </label>
            <label>
              Contract Price
              <input
                type="number"
                step="0.01"
                value={contractPrice}
                disabled={!canEdit}
                onChange={(ev) => setContractPrice(ev.target.value)}
              />
            </label>
            <label>
              Invoice Absolute Amount (AE/IE)
              <input value={money(totals.absolute_amount)} readOnly />
            </label>
          </div>

          <table className="soi-table">
            <thead>
              <tr>
                <th rowSpan={2}>Sr.</th>
                <th rowSpan={2}>DESCRIPTION</th>
                <th colSpan={3}>WORK DONE VALUE (IN INR)</th>
                <th rowSpan={2}>Remarks / Clause</th>
              </tr>
              <tr>
                <th>THIS RA BILL (AE/IE)</th>
                <th>THIS RA BILL (PIU)</th>
                <th>THIS RA BILL (FA-PIU)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="soi-section">
                <td colSpan={6}>
                  <strong>(A) DEMANDS</strong>
                </td>
              </tr>
              {renderRows("work_done", "1. VALUE OF WORK DONE", "total_work")}
              {renderRows("gst", "2. GST", "total_gst")}
              {renderRows("advances", "3. Advances / Other Payment", "total_advances")}
              <tr className="soi-total">
                <td />
                <td>
                  <strong>Total Demands [Sum of A]</strong>
                </td>
                {(["ae", "piu", "fa"] as Col[]).map((col) => (
                  <td key={col} className="num">
                    <strong>{money(totals.total_a[col])}</strong>
                  </td>
                ))}
                <td />
              </tr>

              {renderRows("recoveries", "(B) RECOVERIES / DEDUCTION", "total_b")}
              <tr className="soi-total">
                <td />
                <td>
                  <strong>(C) Amount Payable to Contractor (A−B)</strong>
                </td>
                {(["ae", "piu", "fa"] as Col[]).map((col) => (
                  <td key={col} className="num">
                    <strong>{money(totals.total_c[col])}</strong>
                  </td>
                ))}
                <td />
              </tr>
              {renderRows("withheld_released", "(D) Withheld Amount released")}
              {renderRows("royalty", "(E) Royalty Reimbursement")}
              {renderRows("gst_released", "(F) GST Amount released after proof")}
              {renderRows("others", "(G) Others")}
              <tr className="soi-total">
                <td />
                <td>
                  <strong>Total Amount Payable (C+D+E+F+G)</strong>
                </td>
                {(["ae", "piu", "fa"] as Col[]).map((col) => (
                  <td key={col} className="num">
                    <strong>{money(totals.total_payable[col])}</strong>
                  </td>
                ))}
                <td />
              </tr>
              <tr>
                <td />
                <td>
                  BALANCE CLAIM (%)
                  {canEdit ? (
                    <input
                      style={{ width: "5rem", marginLeft: "0.5rem" }}
                      type="number"
                      step="0.01"
                      value={summary.balance_claim_pct}
                      onChange={(ev) =>
                        setSummary((prev) => (prev ? { ...prev, balance_claim_pct: num(ev.target.value) } : prev))
                      }
                    />
                  ) : (
                    <strong> {summary.balance_claim_pct}</strong>
                  )}
                </td>
                {(["ae", "piu", "fa"] as Col[]).map((col) => (
                  <td key={col} className="num">
                    {money(totals.balance_claim[col])}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>

          <div className="soi-actions">
            {canEdit ? (
              <>
                <button type="button" className="secondary" onClick={copyAeToPiuFa}>
                  Copy AE/IE → PIU & FA-PIU
                </button>
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  Digital signature name
                  <input value={signatureName} onChange={(ev) => setSignatureName(ev.target.value)} />
                </label>
                <button type="submit" disabled={busy}>
                  {busy ? "Saving…" : mode === "create" ? "Submit invoice" : "Save summary"}
                </button>
              </>
            ) : null}
            <div className="soi-sign-box">
              <div>
                <strong>Digitally Signed</strong>
              </div>
              <div>{signatureName || "—"}</div>
              <div className="muted">{mode === "edit" ? "Saved with invoice" : "Will stamp on submit"}</div>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
