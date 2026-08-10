import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
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

function StatCard({
  label,
  value,
  to,
  hint,
}: {
  label: string;
  value: ReactNode;
  to: string;
  hint?: string;
}) {
  return (
    <Link className="stat" to={to} title={`Open ${label}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <span className="stat-hint">{hint || "Open details →"}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { token, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const projectsPath = role === "admin" ? "/projects" : "/executive";
  const ratesPath = role === "admin" ? "/rates" : "/executive";
  const vendorsPath = role === "admin" || role === "government" ? "/vendors" : "/dashboard";

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
            <StatCard label="Projects" value={stats.total_projects} to={projectsPath} hint="Open Projects →" />
            <StatCard label="Total issues" value={stats.total_issues} to="/issues" hint="Open Issues →" />
            <StatCard label="Invoices" value={stats.total_invoices ?? 0} to="/billing" hint="Open Billing →" />
            <StatCard label="Documents" value={stats.total_documents ?? 0} to="/documents" hint="Open Documents →" />
            <StatCard label="Staff details" value="GMC · NHIPMPL · Contractor" to="/staff-details" hint="Organisation professionals →" />
            <StatCard label="Query Raise" value="Tickets" to="/queries" hint="Raise / resolve portal queries →" />
            <StatCard label="Vendors" value={stats.total_vendors ?? 0} to={vendorsPath} hint="Open Vendors →" />
            <StatCard
              label="BOQ amount ₹"
              value={(stats.total_boq_amount ?? 0).toLocaleString("en-IN")}
              to={ratesPath}
              hint="Open Rates / BOQ →"
            />
            <StatCard
              label="Executed ₹"
              value={(stats.total_executed_amount ?? 0).toLocaleString("en-IN")}
              to={ratesPath}
              hint="Open Rates / BOQ →"
            />
            <StatCard
              label="Delayed issues"
              value={stats.delayed_issues}
              to="/issues"
              hint="Open Issues →"
            />
            <StatCard
              label="Compliance"
              value={stats.timeline_compliance_pct != null ? `${stats.timeline_compliance_pct}%` : "—"}
              to="/reports"
              hint="Open Reports →"
            />
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
              <th>GMC representatives</th>
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
