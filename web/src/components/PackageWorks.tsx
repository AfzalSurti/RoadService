import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { VendorDocumentsModal } from "./VendorDocumentsModal";
import { useAuth } from "../auth";
import { WORK_CATEGORIES, formatDays, vendorCategory, type WorkCategoryKey } from "../lib/workCategories";
import type { Vendor } from "../types";

/**
 * Four work tabs for one package, filled from the Vendors list: each vendor
 * linked to this project appears under its "Type of work" category. When
 * `onSelectVendor` is given, clicking a vendor scopes the dashboard to it.
 */
export function PackageWorks({
  projectId,
  selectedVendorId = null,
  onSelectVendor,
}: {
  projectId: number;
  selectedVendorId?: number | null;
  onSelectVendor?: (vendor: Vendor | null) => void;
}) {
  const { token, role } = useAuth();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkCategoryKey>(WORK_CATEGORIES[0].key);
  const [docsVendor, setDocsVendor] = useState<Vendor | null>(null);
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
          {onSelectVendor ? (
            <p className="muted works-hint">Click a vendor to see its issues, invoices and documents in the cards below.</p>
          ) : null}
          <table className="data">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Work order date</th>
                <th>Commencement</th>
                <th>Time limit (days)</th>
                <th>DLP (days)</th>
                <th>EOT (days)</th>
                <th>Progress</th>
                <th>Delays</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr
                  key={v.id}
                  className={
                    onSelectVendor ? `clickable-row${selectedVendorId === v.id ? " row-active" : ""}` : undefined
                  }
                  onClick={onSelectVendor ? () => onSelectVendor(selectedVendorId === v.id ? null : v) : undefined}
                  onKeyDown={
                    onSelectVendor
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectVendor(selectedVendorId === v.id ? null : v);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onSelectVendor ? 0 : undefined}
                  title={onSelectVendor ? "Show this vendor's data in the cards below" : undefined}
                >
                  <td>
                    <strong>{v.name}</strong>
                    {v.brief ? <div className="muted works-brief">{v.brief}</div> : null}
                  </td>
                  <td>{v.work_order_date || "—"}</td>
                  <td>{v.commencement_date || "—"}</td>
                  <td>{formatDays(v.time_limit_completion)}</td>
                  <td>{formatDays(v.defects_liability_period)}</td>
                  <td>{formatDays(v.extension_of_time)}</td>
                  <td>{v.progress_notes || "—"}</td>
                  <td>{v.delay_notes || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn ghost" onClick={() => setDocsVendor(v)}>
                      View details
                    </button>
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
      {docsVendor ? <VendorDocumentsModal vendor={docsVendor} onClose={() => setDocsVendor(null)} /> : null}
    </section>
  );
}
