import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { usePackageScope } from "../lib/projectScope";

type Row = Record<string, unknown>;
type TollPerfData = {
  columns: Record<string, string[]>;
  rows: Record<string, Record<string, string>[]>;
  notes: Record<string, string>;
};

const STEPS: { key: string; label: string }[] = [
  { key: "etc_monthly", label: "Monthly ETC Report" },
  { key: "infrastructure", label: "On-Ground Infrastructure Report" },
  { key: "sla_adherence", label: "On-Ground ETC Operations And SLA Adherence" },
  { key: "toll_collection_summary", label: "Summary Report : Monthly Toll Collection Report" },
];

const EMPTY: TollPerfData = { columns: {}, rows: {}, notes: {} };

const SECTION_TITLE = { tms: "TMS Reports", atms: "ATMS Reports" } as const;

function num(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function csvCell(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/** Totals for the summary cards: the sheet's "Total" row, else the sum of the rows. */
function totals(rows: Record<string, string>[]) {
  const pick = (r: Record<string, string>, part: string) => {
    const key = Object.keys(r).find((k) => k.toLowerCase().includes(part));
    return key ? num(r[key]) : 0;
  };
  const total = rows.find((r) => /^total$/i.test(String(r["Vehicle Type"] || "").trim()));
  const body = rows.filter((r) => r !== total);
  const sum = (part: string) => (total ? pick(total, part) : 0) || body.reduce((a, r) => a + pick(r, part), 0);
  return {
    curVehicles: sum("no of vehicles (for current month)"),
    curFee: sum("fee collected (for current month)"),
    prevVehicles: sum("no of vehicles (for previous month)"),
    prevFee: sum("fee collected (for previous month)"),
    lastYearVehicles: sum("no of vehicles (for corresponding month of previous year)"),
    lastYearFee: sum("fee collected (for corresponding month of previous year)"),
  };
}

/**
 * ATMS Reports / TMS Reports: the four report tabs for one toll plaza at a time. Only the chosen
 * plaza's data is shown, and the summary at the top follows the plaza. GMC Experts import data,
 * add and delete plazas; NHIPMPL sees the same page read-only.
 */
export function TollReportsPage({ section }: { section: "tms" | "atms" }) {
  const { token, role, isReadonly } = useAuth();
  const canEdit = role === "admin" && !isReadonly;
  const { inScope } = usePackageScope();
  const [plazas, setPlazas] = useState<Row[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [plazaId, setPlazaId] = useState<string>("");
  // Reports are monthly: pick the month (defaults to the latest month with data).
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState<string>(thisMonth);
  const [months, setMonths] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<TollPerfData>(EMPTY);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newPlaza, setNewPlaza] = useState({ name: "", project_id: "", chainage: "", lanes: "4" });

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = SECTION_TITLE[section];
  }, [section]);

  const shownPlazas = useMemo(
    () => plazas.filter((p) => p.project_id == null || inScope(Number(p.project_id))),
    [plazas, inScope]
  );
  const plaza = shownPlazas.find((p) => String(p.id) === plazaId) || null;

  const loadPlazas = async () => {
    if (!token) return;
    try {
      setPlazas(await api.nhitGet<Row[]>(token, "/toll/plazas"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load toll plazas");
    }
  };

  useEffect(() => {
    void loadPlazas();
    if (token) api.projects(token).then(setProjects).catch(() => setProjects([]));
  }, [token]);

  // Keep a valid plaza chosen (first one of the package by default).
  useEffect(() => {
    if (!shownPlazas.length) {
      if (plazaId) setPlazaId("");
      return;
    }
    if (!shownPlazas.some((p) => String(p.id) === plazaId)) setPlazaId(String(shownPlazas[0].id));
  }, [shownPlazas]);

  const plazaQuery = `section=${section}${plazaId ? `&plaza_id=${plazaId}` : ""}`;
  const query = `${plazaQuery}&month=${month}`;

  // Months that have data for this plaza; jump to the latest one when the plaza changes.
  const loadMonths = async (jump: boolean) => {
    if (!token) return;
    try {
      const list = await api.nhitGet<string[]>(token, `/toll-perf/months?${plazaQuery}`);
      setMonths(list);
      if (jump) setMonth(list[0] || thisMonth);
    } catch {
      setMonths([]);
    }
  };
  useEffect(() => {
    void loadMonths(true);
  }, [token, plazaQuery]);
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const load = async () => {
    if (!token) return;
    try {
      const d = await api.nhitGet<TollPerfData>(token, `/toll-perf?${query}`);
      setData(d);
      setNotes(d.notes || {});
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load the reports");
    }
  };

  useEffect(() => {
    setData(EMPTY);
    void load();
  }, [token, query]);

  const current = STEPS[step];
  const columns = data.columns[current.key] || [];
  const rows = data.rows[current.key] || [];
  const summary = totals(data.rows.toll_collection_summary || []);
  const projectName = (id: unknown) => projects.find((p) => String(p.id) === String(id))?.name || "—";

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const onImport = (file: File) =>
    run(async () => {
      if (!token) return;
      const fd = new FormData();
      fd.append("file", file);
      await api.nhitPostForm(token, `/toll-perf/${current.key}/import?${query}`, fd);
      await load();
      await loadMonths(false);
    }, `${current.label}: data imported for ${plaza ? String(plaza.name) : "this section"} · ${monthLabel(month)}.`);

  const addPlaza = (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (newPlaza.name.trim().length < 3) {
      setError("Plaza name is required");
      return;
    }
    void run(async () => {
      const created = await api.nhitPost<Row>(token, "/toll/plazas", {
        name: newPlaza.name.trim(),
        project_id: newPlaza.project_id ? Number(newPlaza.project_id) : null,
        chainage: newPlaza.chainage.trim() || null,
        lanes: Number(newPlaza.lanes || 4),
      });
      await loadPlazas();
      setPlazaId(String(created.id));
      setNewPlaza({ name: "", project_id: "", chainage: "", lanes: "4" });
      setShowAdd(false);
    }, "Toll plaza added.");
  };

  const deletePlaza = () => {
    if (!token || !plaza) return;
    if (!window.confirm(`Delete toll plaza ${String(plaza.name)}?\n\nIts report data and daily figures are deleted too.`)) return;
    void run(async () => {
      await api.nhitDelete(token, `/toll/plazas/${String(plaza.id)}`);
      setPlazaId("");
      await loadPlazas();
    }, `${String(plaza.name)} deleted.`);
  };

  const exportExcel = () => {
    const lines = [columns.map(csvCell).join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${section}_${plaza ? String(plaza.name).replace(/\W+/g, "_") : "all"}_${month}_${current.key}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const exportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (v: unknown) => String(v ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c);
    const head = columns.map((c) => `<th>${esc(c)}</th>`).join("");
    const body =
      rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("") ||
      `<tr><td colspan="${columns.length || 1}">No data</td></tr>`;
    const extra =
      current.key === "toll_collection_summary"
        ? `<h3>PD's comments/observations on perusal of AEs/IEs MPR</h3><p>${esc(notes.pd_comments) || "—"}</p>
           <h3>AE's Compliance on PD's comments/observations</h3><p>${esc(notes.ae_compliance) || "—"}</p>`
        : "";
    w.document.write(`<!doctype html><html><head><title>${esc(current.label)}</title>
      <style>body{font-family:Segoe UI,Arial,sans-serif;padding:24px}h1{color:#0b2a43}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;font-size:12px}
      th{background:#0b2a43;color:#fff;text-align:left}</style></head><body>
      <h1>${esc(current.label)}</h1><p>${esc(SECTION_TITLE[section])} · ${esc(plaza ? plaza.name : "All")} · Generated ${new Date().toLocaleString()}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${extra}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const saveNotes = () =>
    run(async () => {
      if (!token) return;
      const saved = await api.nhitPut<Record<string, string>>(token, `/toll-perf/notes?${query}`, {
        pd_comments: notes.pd_comments || "",
        ae_compliance: notes.ae_compliance || "",
      });
      setNotes(saved);
    }, "Comments saved.");

  const inr = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <section className="panel">
        <div className="overview-head">
          <h2 style={{ marginTop: 0 }}>{SECTION_TITLE[section]}</h2>
          <label>
            Toll plaza
            <select value={plazaId} onChange={(e) => setPlazaId(e.target.value)}>
              {!shownPlazas.length ? <option value="">No toll plazas yet</option> : null}
              {shownPlazas.map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                  {p.project_id ? ` (${projectName(p.project_id)})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Month
            <input type="month" value={month} max={thisMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          {canEdit ? (
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setShowAdd((v) => !v)}>
                + Add plaza
              </button>
              <button type="button" className="btn danger" disabled={!plaza || busy} onClick={deletePlaza}>
                Delete plaza
              </button>
            </div>
          ) : null}
        </div>

        {months.length ? (
          <div className="month-chips">
            <span className="muted">Months with reports:</span>
            {months.map((m) => (
              <button
                key={m}
                type="button"
                className={`month-chip${m === month ? " active" : ""}`}
                onClick={() => setMonth(m)}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
        ) : null}

        {showAdd && canEdit ? (
          <form className="form-grid" onSubmit={addPlaza} style={{ marginBottom: "1rem" }}>
            <label>
              Plaza name
              <input value={newPlaza.name} onChange={(e) => setNewPlaza({ ...newPlaza, name: e.target.value })} />
            </label>
            <label>
              Package
              <select value={newPlaza.project_id} onChange={(e) => setNewPlaza({ ...newPlaza, project_id: e.target.value })}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chainage
              <input value={newPlaza.chainage} onChange={(e) => setNewPlaza({ ...newPlaza, chainage: e.target.value })} />
            </label>
            <label>
              Lanes
              <input inputMode="numeric" value={newPlaza.lanes} onChange={(e) => setNewPlaza({ ...newPlaza, lanes: e.target.value })} />
            </label>
            <div className="btn-row span-2">
              <button className="btn" type="submit" disabled={busy}>
                Save plaza
              </button>
            </div>
          </form>
        ) : null}

        <div className="stat-grid">
          <article className="stat">
            <span>Vehicles · current month</span>
            <strong>{inr(summary.curVehicles)}</strong>
          </article>
          <article className="stat">
            <span>Fee collected · current month ₹</span>
            <strong>{inr(summary.curFee)}</strong>
          </article>
          <article className="stat">
            <span>Vehicles · previous month</span>
            <strong>{inr(summary.prevVehicles)}</strong>
          </article>
          <article className="stat">
            <span>Fee collected · previous month ₹</span>
            <strong>{inr(summary.prevFee)}</strong>
          </article>
        </div>
        <p className="muted" style={{ margin: "0.5rem 0 0" }}>
          {plaza ? `Showing ${String(plaza.name)} only` : "Choose a toll plaza"} · {monthLabel(month)} · figures from the
          Monthly Toll Collection Report.
        </p>

        <div className="toll-perf-stepper" style={{ marginTop: "1rem" }}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`toll-perf-step${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
            >
              <span className="toll-perf-step-num">{i + 1}</span>
              <span className="toll-perf-step-label">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head-row">
          <div>
            <h2 style={{ margin: 0 }}>{current.label}</h2>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Step {step + 1} of {STEPS.length}
              {plaza ? ` · ${String(plaza.name)}` : ""} · {monthLabel(month)}
            </p>
          </div>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={exportPdf}>
              PDF
            </button>
            <button className="btn ghost" type="button" onClick={exportExcel}>
              Excel
            </button>
            {canEdit ? (
              <label className={`btn${busy || !plaza ? " disabled" : ""}`} style={{ cursor: "pointer" }}>
                {busy ? "Importing…" : "Import Data"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  disabled={busy || !plaza}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onImport(f);
                  }}
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const isTotal = /^total$/i.test(String(r["Vehicle Type"] || "").trim());
                return (
                  <tr key={ri} className={isTotal ? "total-row" : undefined}>
                    {columns.map((c) => (
                      <td key={c}>{r[c] ?? ""}</td>
                    ))}
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={columns.length || 1} className="muted">
                    No data for {plaza ? String(plaza.name) : "this plaza"} in {monthLabel(month)}.
                    {canEdit ? " Use Import Data to upload the Excel sheet." : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {current.key === "toll_collection_summary" ? (
          <div className="form-grid" style={{ marginTop: "1rem" }}>
            <label className="span-2">
              PD&apos;s comments/observations on perusal of AEs/IEs MPR
              <textarea
                value={notes.pd_comments || ""}
                disabled={!canEdit}
                onChange={(e) => setNotes({ ...notes, pd_comments: e.target.value })}
              />
            </label>
            <label className="span-2">
              AE&apos;s Compliance on PD&apos;s comments/observations
              <textarea
                value={notes.ae_compliance || ""}
                disabled={!canEdit}
                onChange={(e) => setNotes({ ...notes, ae_compliance: e.target.value })}
              />
            </label>
            {canEdit ? (
              <div className="span-2">
                <button className="btn" type="button" disabled={busy} onClick={() => void saveNotes()}>
                  {busy ? "Saving…" : "Save comments"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
