import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatusBadge, formatLabel } from "../components/StatusBadge";
import type { DashboardStats, Project } from "../types";

const COLORS: Record<string, string> = {
  open: "#e11d48",
  in_progress: "#f59e0b",
  completed: "#3b82f6",
  verification_pending: "#8b5cf6",
  under_review: "#ea580c",
  closed: "#16a34a",
};

export function DashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([api.dashboard(token), api.projects(token)])
      .then(([s, p]) => {
        setStats(s);
        setProjects(p);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  const pieData = useMemo(
    () =>
      Object.entries(stats?.by_status || {}).map(([name, value]) => ({
        name: formatLabel(name),
        key: name,
        value,
      })),
    [stats]
  );

  const barData = useMemo(
    () =>
      (stats?.contractor_performance || []).map((c) => ({
        name: `C${c.contractor_id}`,
        total: c.total,
        closed: c.closed,
      })),
    [stats]
  );

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Dashboard";
  }, []);

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {stats ? (
        <>
          <section className="stat-grid">
            <article className="stat">
              <span>Projects</span>
              <strong>{stats.total_projects}</strong>
            </article>
            <article className="stat">
              <span>Total issues</span>
              <strong>{stats.total_issues}</strong>
            </article>
            <article className="stat">
              <span>Invoices</span>
              <strong>{stats.total_invoices ?? 0}</strong>
            </article>
            <article className="stat">
              <span>Documents</span>
              <strong>{stats.total_documents ?? 0}</strong>
            </article>
            <article className="stat">
              <span>Vendors</span>
              <strong>{stats.total_vendors ?? 0}</strong>
            </article>
            <article className="stat">
              <span>BOQ amount ₹</span>
              <strong>{(stats.total_boq_amount ?? 0).toLocaleString("en-IN")}</strong>
            </article>
            <article className="stat">
              <span>Executed ₹</span>
              <strong>{(stats.total_executed_amount ?? 0).toLocaleString("en-IN")}</strong>
            </article>
            <article className="stat">
              <span>Delayed issues</span>
              <strong>{stats.delayed_issues}</strong>
            </article>
            <article className="stat">
              <span>Compliance</span>
              <strong>
                {stats.timeline_compliance_pct != null ? `${stats.timeline_compliance_pct}%` : "—"}
              </strong>
            </article>
          </section>

          <section className="charts">
            <div className="panel">
              <h2>Issue status</h2>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                      {pieData.map((entry) => (
                        <Cell key={entry.key} fill={COLORS[entry.key] || "#0f4c81"} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend" style={{ marginTop: 8 }}>
                {pieData.map((d) => (
                  <StatusBadge key={d.key} status={d.key} />
                ))}
              </div>
            </div>
            <div className="panel">
              <h2>Contractor performance</h2>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#1a6bab" name="Total" />
                    <Bar dataKey="closed" fill="#16a34a" name="Closed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section className="panel">
        <h2>Projects</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Contractors</th>
              <th>Surveyors</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.location}</td>
                <td>{p.contractors.length}</td>
                <td>{p.surveyors.length}</td>
              </tr>
            ))}
            {!projects.length ? (
              <tr>
                <td colSpan={4}>No projects yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
