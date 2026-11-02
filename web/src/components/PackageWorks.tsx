import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { WORK_CATEGORIES, vendorCategory, type WorkCategoryKey } from "../lib/workCategories";
import type { Vendor } from "../types";

/**
 * Four work tabs for one package, filled from the Vendors list: each vendor
 * linked to this project appears under its "Type of work" category.
 */
export function PackageWorks({ projectId }: { projectId: number }) {
  const { token, role } = useAuth();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkCategoryKey>(WORK_CATEGORIES[0].key);
  const canManage = role === "admin";
  const canOpenVendors = role === "admin" || role === "government";

  useEffect(() => {
    if (!token) return;
    api
      .vendors(token)
      .then((v) => {
        setVendors(v);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const byCategory = useMemo(() => {
    const map: Record<WorkCategoryKey, Vendor[]> = {
      schedule_b: [],
      routine_maintenance: [],
      item_wise_civil: [],
      atms_tms: [],
    };
    for (const v of vendors || []) {
      if (v.project_id !== projectId) continue;
      const cat = vendorCategory(v);
      if (cat) map[cat].push(v);
    }
    return map;
  }, [vendors, projectId]);

  const rows = byCategory[tab];
  const active = WORK_CATEGORIES.find((c) => c.key === tab)!;

  return (
    <section className="panel package-works">
      <div className="panel-head-row">
        <h2>Works</h2>
        {canOpenVendors ? (
          <Link className="btn ghost" to="/vendors">
            {canManage ? "Manage vendors" : "Open Vendors"}
          </Link>
        ) : null}
      </div>
      <div className="works-tabs" role="tablist">
        {WORK_CATEGORIES.map((c, i) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={tab === c.key}
            className={`works-tab${tab === c.key ? " active" : ""}`}
            onClick={() => setTab(c.key)}
          >
            <span className="works-tab-no">{i + 1}</span>
            <span className="works-tab-label">{c.label}</span>
            <span className="works-tab-count">{vendors ? byCategory[c.key].length : "…"}</span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="muted">Works could not be loaded: {error}</p>
      ) : !vendors ? (
        <p className="muted">Loading works…</p>
      ) : rows.length ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Work order date</th>
                <th>Commencement</th>
                <th>Time limit</th>
                <th>DLP</th>
                <th>Progress</th>
                <th>Delays</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.name}</strong>
                    {v.brief ? <div className="muted works-brief">{v.brief}</div> : null}
                  </td>
                  <td>{v.work_order_date || "—"}</td>
                  <td>{v.commencement_date || "—"}</td>
                  <td>{v.time_limit_completion || "—"}</td>
                  <td>{v.defects_liability_period || "—"}</td>
                  <td>{v.progress_notes || "—"}</td>
                  <td>{v.delay_notes || "—"}</td>
                  <td>
                    <div className="btn-row">
                      {v.work_order_path ? (
                        <a href={mediaUrl(v.work_order_path)} target="_blank" rel="noreferrer">
                          Work order
                        </a>
                      ) : null}
                      {v.loa_path ? (
                        <a href={mediaUrl(v.loa_path)} target="_blank" rel="noreferrer">
                          LOA
                        </a>
                      ) : null}
                      {!v.work_order_path && !v.loa_path ? "—" : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">
          No vendors under “{active.label}” for this package yet.
          {canManage ? " Add one in Vendors with this package and type of work." : ""}
        </p>
      )}
    </section>
  );
}
