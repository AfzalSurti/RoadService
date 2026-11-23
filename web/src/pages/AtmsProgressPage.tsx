import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { projectShortName, usePackageScope } from "../lib/projectScope";
import type { Project } from "../types";

type AtmsRow = {
  r: number;
  sr: string;
  work: string;
  uom: string;
  target: string;
  remark: string;
  kind: "item" | "group" | "agg";
  total?: number;
  completed?: number;
  fixed_pct?: number | null;
  agg?: { type: "range"; from: number; to: number } | { type: "list"; rows: number[] };
};
type AtmsData = {
  project_id: number;
  report_date?: string;
  source_name?: string | null;
  sheet?: string;
  title: string;
  headers: string[];
  rows: AtmsRow[];
  updated_by?: string | null;
  updated_at?: string | null;
};

/** % of every row, worked out exactly like the tracker sheet: item = Completed / Total;
 * SUBTOTAL rows = average of the item %s in their range; AVERAGE rows = average of other % rows. */
function computePct(rows: AtmsRow[]): Map<number, number | null> {
  const byR = new Map(rows.map((x) => [x.r, x]));
  const memo = new Map<number, number | null>();
  const pct = (r: number, depth = 0): number | null => {
    if (memo.has(r)) return memo.get(r)!;
    const x = byR.get(r);
    let v: number | null = null;
    if (x && depth < 20) {
      if (x.kind === "item") {
        v = x.fixed_pct != null ? x.fixed_pct : x.total ? Number(x.completed || 0) / x.total : null;
      } else if (x.agg) {
        const a = x.agg;
        const vals =
          a.type === "range"
            ? rows.filter((y) => y.kind === "item" && y.r >= a.from && y.r <= a.to).map((y) => pct(y.r, depth + 1))
            : a.rows.map((n) => pct(n, depth + 1));
        const ok = vals.filter((t): t is number => t != null);
        v = ok.length ? ok.reduce((s, t) => s + t, 0) / ok.length : null;
      } else if (x.fixed_pct != null) {
        v = x.fixed_pct;
      }
    }
    memo.set(r, v);
    return v;
  };
  rows.forEach((x) => pct(x.r));
  return memo;
}

const fmtPct = (v: number | null | undefined) => (v == null ? "" : `${(v * 100).toFixed(2)}%`);
const fmtNum = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/**
 * ATMS Physical Progress: the package's ATMS Project Status tracker in the same layout as the
 * Excel (OFC, civil, erection, material supply, installation), with overall progress at the top.
 * GMC Experts import the Excel or edit completed quantities, target dates and remarks.
 */
export function AtmsProgressPage() {
  const { token, role, isReadonly } = useAuth();
  const canEdit = role === "admin" && !isReadonly;
  const { inScope } = usePackageScope();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [data, setData] = useState<AtmsData | null>(null);
  const [draft, setDraft] = useState<AtmsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Daily reports: one tracker per package per day.
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState<string>("");
  const [days, setDays] = useState<string[]>([]);
  const [uploadDay, setUploadDay] = useState<string>(today);
  const fmtDay = (d: string) => (d ? d.split("-").reverse().join(".") : "");

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "ATMS Physical Progress";
  }, []);

  useEffect(() => {
    if (token) api.projects(token).then(setProjects).catch(() => setProjects([]));
  }, [token]);

  const shown = useMemo(() => projects.filter((p) => inScope(p.id)), [projects, inScope]);
  useEffect(() => {
    if (shown.length && !shown.some((p) => p.id === projectId)) setProjectId(shown[0].id);
  }, [shown]);

  const loadDays = async () => {
    if (!token || !projectId) return [] as string[];
    try {
      const list = await api.nhitGet<string[]>(token, `/atms-progress/dates?project_id=${projectId}`);
      setDays(list);
      return list;
    } catch {
      setDays([]);
      return [] as string[];
    }
  };

  const load = async (forDay = day) => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const d = await api.nhitGet<AtmsData | null>(
        token,
        `/atms-progress?project_id=${projectId}${forDay ? `&day=${forDay}` : ""}`
      );
      setData(d);
      if (d?.report_date && d.report_date !== forDay) setDay(d.report_date);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load the ATMS progress");
    } finally {
      setLoading(false);
    }
  };

  // New package: latest day. New day: that day's report.
  useEffect(() => {
    setDraft(null);
    setData(null);
    setDay("");
    void loadDays();
    void load("");
  }, [token, projectId]);

  const view = draft || data;
  const pcts = useMemo(() => (view ? computePct(view.rows) : new Map<number, number | null>()), [view]);
  const overall = useMemo(
    () =>
      (view?.rows || []).filter((x) => x.kind === "agg" && /^overall/i.test(x.work)).map((x) => ({ label: x.work, v: pcts.get(x.r) })),
    [view, pcts]
  );
  const sections = useMemo(() => {
    // Top-level headings (1, 2, 3 ...) with the % of the sub-total row that closes them.
    const out: { label: string; v: number | null | undefined }[] = [];
    const rows = view?.rows || [];
    rows.forEach((x, i) => {
      if (x.kind === "group" && /^\d+$/.test(x.sr)) {
        const next = rows.slice(i + 1).find((y) => y.kind === "agg" && !y.work);
        const nextGroup = rows.slice(i + 1).findIndex((y) => y.kind === "group" && /^\d+$/.test(y.sr));
        const closesHere = next && (nextGroup < 0 || rows.indexOf(next) < i + 1 + nextGroup);
        if (closesHere) out.push({ label: x.work, v: pcts.get(next!.r) });
      }
    });
    return out;
  }, [view, pcts]);
  const items = (view?.rows || []).filter((x) => x.kind === "item");
  const doneItems = items.filter((x) => (pcts.get(x.r) ?? 0) >= 0.9999).length;
  const project = shown.find((p) => p.id === projectId) || null;
  const h = (i: number, fallback: string) => view?.headers?.[i] || fallback;

  const setRow = (r: number, patch: Partial<AtmsRow>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            rows: d.rows.map((x) => {
              if (x.r !== r) return x;
              const next = { ...x, ...patch };
              // A typed-in % in the sheet no longer applies once the quantity is edited here.
              if ("completed" in patch) next.fixed_pct = null;
              return next;
            }),
          }
        : d
    );

  const onImport = async (file: File) => {
    if (!token || !projectId) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("project_id", String(projectId));
      fd.append("file", file);
      if (uploadDay) fd.append("report_date", uploadDay);
      const saved = await api.nhitPostForm<AtmsData>(token, "/atms-progress/import", fd);
      setData(saved);
      setDraft(null);
      if (saved?.report_date) setDay(saved.report_date);
      await loadDays();
      setMsg(
        `Daily report for ${fmtDay(saved?.report_date || uploadDay)} uploaded from ${file.name}` +
          (saved?.sheet ? ` (sheet "${saved.sheet}")` : "") +
          "."
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!token || !projectId || !draft) return;
    for (const x of draft.rows) {
      if (x.kind === "item" && (Number(x.completed) < 0 || (x.total != null && Number(x.completed) > x.total))) {
        setError(`${x.sr} ${x.work}: completed must be between 0 and ${x.total}`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      setData(
        await api.nhitPut<AtmsData>(token, `/atms-progress/${projectId}?day=${day || today}`, {
          title: draft.title,
          headers: draft.headers,
          rows: draft.rows,
        })
      );
      setDraft(null);
      setMsg("Progress saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!view) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      cell(view.title),
      [h(0, "Sr"), h(1, "Work Details"), h(2, "UOM"), h(3, "Total"), h(4, "Completed"), h(5, "Balance"), h(6, "Completed (%)"), h(7, "Target Date"), h(8, "Remarks")]
        .map(cell)
        .join(","),
      ...view.rows.map((x) => {
        const p = pcts.get(x.r);
        const bal = x.kind === "item" && x.total != null ? x.total - Number(x.completed || 0) : "";
        return [x.sr, x.work, x.uom, x.total ?? "", x.kind === "item" ? x.completed : "", bal, p == null ? "" : (p * 100).toFixed(2) + "%", x.target, x.remark]
          .map(cell)
          .join(",");
      }),
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `ATMS_progress_${project ? projectShortName(project).replace(/\W+/g, "_") : projectId}.csv`;
    a.click();
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <div className="works-tabs inventory-tabs">
        {shown.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`works-tab${p.id === projectId ? " active" : ""}`}
            onClick={() => setProjectId(p.id)}
          >
            <span className="works-tab-no">{i + 1}</span>
            <span className="works-tab-label">{projectShortName(p)}</span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head-row">
          <div>
            <h2 style={{ margin: 0 }}>ATMS Physical Progress</h2>
            {view?.report_date ? (
              <p className="atms-day">
                Daily report · <strong>{fmtDay(view.report_date)}</strong>
                {view.source_name ? <span className="muted"> · {view.source_name}</span> : null}
              </p>
            ) : null}
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {draft ? (
                <input
                  className="atms-title-input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              ) : (
                view?.title || (loading ? "Loading…" : "No tracker for this package yet")
              )}
              {view?.updated_by && !draft
                ? ` · updated by ${view.updated_by}${view.updated_at ? ` on ${new Date(view.updated_at).toLocaleDateString()}` : ""}`
                : ""}
            </p>
          </div>
          <div className="btn-row">
            {view && !draft ? (
              <>
                <button className="btn ghost" type="button" onClick={() => window.print()}>
                  Print / PDF
                </button>
                <button className="btn ghost" type="button" onClick={exportCsv}>
                  Export to Excel
                </button>
              </>
            ) : null}
            {canEdit && view && !draft ? (
              <button className="btn" type="button" onClick={() => setDraft(JSON.parse(JSON.stringify(view)))}>
                Edit this day&apos;s report
              </button>
            ) : null}
            {canEdit && view && !draft && view.report_date ? (
              <button
                className="btn danger"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!token || !projectId || !view.report_date) return;
                  if (!window.confirm(`Delete the daily report of ${fmtDay(view.report_date)}?`)) return;
                  setBusy(true);
                  try {
                    await api.nhitDelete(token, `/atms-progress/${projectId}?day=${view.report_date}`);
                    setDay("");
                    await loadDays();
                    await load("");
                    setMsg(`Daily report of ${fmtDay(view.report_date)} deleted.`);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : "Delete failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete this day
              </button>
            ) : null}
            {canEdit && draft ? (
              <>
                <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button className="btn ghost" type="button" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              </>
            ) : null}
            {canEdit && !draft ? (
              <label className="atms-upload-day">
                Report date
                <input type="date" value={uploadDay} max={today} onChange={(e) => setUploadDay(e.target.value)} />
              </label>
            ) : null}
            {canEdit && !draft ? (
              <label className={`btn ghost${busy ? " disabled" : ""}`} style={{ cursor: "pointer" }}>
                {busy ? "Uploading…" : "Upload daily report (Excel)"}
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  hidden
                  disabled={busy}
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

        <div className="overview-head" style={{ marginTop: "0.75rem", marginBottom: "0.25rem" }}>
          <label>
            View day
            <input
              type="date"
              value={day}
              max={today}
              onChange={(e) => {
                setDay(e.target.value);
                setDraft(null);
                void load(e.target.value);
              }}
            />
          </label>
          {days.length ? (
            <div className="month-chips" style={{ margin: 0 }}>
              <span className="muted">Days with reports:</span>
              {days.slice(0, 12).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`month-chip${d === (view?.report_date || day) ? " active" : ""}`}
                  onClick={() => {
                    setDay(d);
                    setDraft(null);
                    void load(d);
                  }}
                >
                  {fmtDay(d)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {day && !loading && !view ? (
          <p className="muted">No daily report for {fmtDay(day)}{canEdit ? " — upload one with the date set above." : "."}</p>
        ) : null}

        {view ? (
          <>
            <div className="stat-grid atms-cards">
              {overall.map((o) => (
                <article key={o.label} className={`stat${/progress/i.test(o.label) ? " atms-main" : ""}`}>
                  <span>{o.label}</span>
                  <strong>{fmtPct(o.v)}</strong>
                  <span className="atms-bar">
                    <span style={{ width: `${Math.min(100, (o.v || 0) * 100)}%` }} />
                  </span>
                </article>
              ))}
              <article className="stat">
                <span>Work items completed</span>
                <strong>
                  {doneItems} / {items.length}
                </strong>
              </article>
            </div>
            {sections.length ? (
              <div className="bar-chart" style={{ marginTop: "1rem" }}>
                {sections.map((sct) => (
                  <div className="bar-row" key={sct.label}>
                    <span className="bar-label">{sct.label}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${Math.min(100, (sct.v || 0) * 100)}%` }} />
                    </span>
                    <span className="bar-value">{fmtPct(sct.v)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : !loading ? (
          <p className="muted">
            {canEdit
              ? "Import the ATMS Project Status Excel for this package (Sr, Work Details, UOM, Total, Completed, Balance, Completed (%), Target Date, Remarks)."
              : "GMC Experts have not loaded the ATMS tracker for this package yet."}
          </p>
        ) : null}
      </section>

      {view ? (
        <section className="panel">
          <h2 className="atms-sheet-title">{view.title}</h2>
          <div className="table-scroll">
            <table className="data atms-table" data-nofilter>
              <thead>
                <tr>
                  <th>{h(0, "Sr")}</th>
                  <th>{h(1, "Work Details")}</th>
                  <th>{h(2, "UOM")}</th>
                  <th>{h(3, "Total")}</th>
                  <th>{h(4, "Completed")}</th>
                  <th>{h(5, "Balance")}</th>
                  <th>{h(6, "Completed (%)")}</th>
                  <th>{h(7, "Target Date to Complete")}</th>
                  <th>{h(8, "Remarks")}</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((x) => {
                  const p = pcts.get(x.r);
                  if (x.kind === "item") {
                    const bal = x.total != null ? x.total - Number(x.completed || 0) : null;
                    return (
                      <tr key={x.r} className={p != null && p >= 0.9999 ? "atms-done" : undefined}>
                        <td>{x.sr}</td>
                        <td>{x.work}</td>
                        <td>{x.uom}</td>
                        <td className="num">{fmtNum(x.total)}</td>
                        <td className="num">
                          {draft ? (
                            <input
                              className="qty-input"
                              inputMode="decimal"
                              value={String(x.completed ?? "")}
                              onChange={(e) =>
                                setRow(x.r, { completed: e.target.value === "" ? 0 : (Number(e.target.value) as number) })
                              }
                            />
                          ) : (
                            fmtNum(x.completed)
                          )}
                        </td>
                        <td className="num">{fmtNum(bal)}</td>
                        <td>
                          <span className="atms-pct">
                            <span className="atms-bar">
                              <span style={{ width: `${Math.min(100, (p || 0) * 100)}%` }} />
                            </span>
                            {fmtPct(p)}
                          </span>
                        </td>
                        <td>
                          {draft ? (
                            <input className="remark-input" value={x.target} onChange={(e) => setRow(x.r, { target: e.target.value })} />
                          ) : (
                            x.target
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <input className="remark-input" value={x.remark} onChange={(e) => setRow(x.r, { remark: e.target.value })} />
                          ) : (
                            x.remark
                          )}
                        </td>
                      </tr>
                    );
                  }
                  if (x.kind === "group") {
                    return (
                      <tr key={x.r} className={`atms-group${/^\d+$/.test(x.sr) ? " atms-section" : ""}`}>
                        <td>{x.sr}</td>
                        <td colSpan={5}>{x.work}</td>
                        <td>{p != null ? fmtPct(p) : ""}</td>
                        <td colSpan={2}></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={x.r} className={x.work ? "atms-overall" : "atms-subtotal"}>
                      <td colSpan={6}>{x.work || "Sub-total"}</td>
                      <td>
                        <span className="atms-pct">
                          <span className="atms-bar">
                            <span style={{ width: `${Math.min(100, (p || 0) * 100)}%` }} />
                          </span>
                          {fmtPct(p)}
                        </span>
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
