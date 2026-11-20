import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project } from "../types";

type Row = Record<string, unknown>;
type Monthly = {
  month: string;
  package: string;
  defects: {
    raised: number;
    closed: number;
    open_at_month_end: number;
    avg_days_to_close: number | null;
    by_contractor: Row[];
  };
  bills: { count: number; amount: number; cancelled: number; rows: Row[] };
  work: { amount: number; rows: Row[] };
  contractors: Row[];
  attendance: Row[];
};

const inr = (n: unknown) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/**
 * Report by month: defect management, bills, work done, contractor-wise progress and
 * attendance by person. Every table has the Export to Excel button (TableFilters).
 */
export function MonthlyReport() {
  const { token, role } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Monthly | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) api.projects(token).then(setProjects).catch(() => setProjects([]));
  }, [token]);

  useEffect(() => {
    if (!token || !month) return;
    setBusy(true);
    api
      .monthlyReport(token, month, projectId ? Number(projectId) : undefined)
      .then((d) => {
        setData(d as Monthly);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the monthly report"))
      .finally(() => setBusy(false));
  }, [token, month, projectId]);

  if (role === "surveyor") return null;

  return (
    <section className="panel monthly-report">
      <div className="overview-head">
        <h2>Monthly report</h2>
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <label>
          Package
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All packages</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {busy && !data ? <p className="muted">Loading…</p> : null}
      {data ? (
        <>
          <div className="stat-grid">
            <article className="stat">
              <span>Defects raised</span>
              <strong>{data.defects.raised}</strong>
            </article>
            <article className="stat">
              <span>Defects closed</span>
              <strong>{data.defects.closed}</strong>
            </article>
            <article className="stat">
              <span>Open at month end</span>
              <strong>{data.defects.open_at_month_end}</strong>
            </article>
            <article className="stat">
              <span>Avg. issue → close</span>
              <strong>{data.defects.avg_days_to_close == null ? "—" : `${data.defects.avg_days_to_close} days`}</strong>
            </article>
            <article className="stat">
              <span>Bills</span>
              <strong>{data.bills.count}</strong>
            </article>
            <article className="stat">
              <span>Billed ₹</span>
              <strong>{inr(data.bills.amount)}</strong>
            </article>
            <article className="stat">
              <span>Work done this month ₹</span>
              <strong>{inr(data.work.amount)}</strong>
            </article>
            <article className="stat">
              <span>Bills cancelled</span>
              <strong>{data.bills.cancelled}</strong>
            </article>
          </div>

          <h3>Defect management · by contractor</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Raised</th>
                  <th>Closed</th>
                  <th>Open at month end</th>
                </tr>
              </thead>
              <tbody>
                {data.defects.by_contractor.map((r) => (
                  <tr key={String(r.contractor)}>
                    <td>{String(r.contractor)}</td>
                    <td>{String(r.raised)}</td>
                    <td>{String(r.closed)}</td>
                    <td>{String(r.open_at_month_end)}</td>
                  </tr>
                ))}
                {!data.defects.by_contractor.length ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No defects this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h3>Bills</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Vendor</th>
                  <th>Package</th>
                  <th>Date</th>
                  <th>BOQ items</th>
                  <th>Amount ₹</th>
                </tr>
              </thead>
              <tbody>
                {data.bills.rows.map((b) => (
                  <tr key={`${String(b.vendor)}-${String(b.bill_no)}`}>
                    <td>{String(b.bill_no)}</td>
                    <td>{String(b.vendor)}</td>
                    <td>{String(b.package || "—")}</td>
                    <td>{String(b.bill_date || "—")}</td>
                    <td>{String(b.items)}</td>
                    <td>{inr(b.amount)}</td>
                  </tr>
                ))}
                {!data.bills.rows.length ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No bills this month.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h3>Work and contractor-wise progress</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Package</th>
                  <th>Contract value ₹</th>
                  <th>Work done this month ₹</th>
                  <th>Work done to date ₹</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {data.contractors.map((c) => (
                  <tr key={`${String(c.vendor)}-${String(c.package)}`}>
                    <td>{String(c.vendor)}</td>
                    <td>{String(c.package || "—")}</td>
                    <td>{inr(c.contract_value)}</td>
                    <td className="boq-done">{inr(c.work_done_this_month)}</td>
                    <td>{inr(c.work_done_to_date)}</td>
                    <td>{c.progress_pct == null ? "—" : `${Number(c.progress_pct).toFixed(1)}%`}</td>
                  </tr>
                ))}
                {!data.contractors.length ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No vendors with BOQ items.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {role !== "contractor" ? (
            <>
              <h3>Attendance by person</h3>
              <div className="table-scroll">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Designation</th>
                      <th>Employer</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Leave</th>
                      <th>On tour</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attendance.map((a) => (
                      <tr key={`${String(a.person)}-${String(a.designation)}`}>
                        <td>{String(a.person)}</td>
                        <td>{String(a.designation || "—")}</td>
                        <td>{String(a.employer || "—")}</td>
                        <td>{String(a.present)}</td>
                        <td>{String(a.absent)}</td>
                        <td>{String(a.leave)}</td>
                        <td>{String(a.on_tour)}</td>
                        <td>{Number(a.hours || 0).toFixed(1)}</td>
                      </tr>
                    ))}
                    {!data.attendance.length ? (
                      <tr>
                        <td colSpan={8} className="muted">
                          No attendance recorded this month.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
