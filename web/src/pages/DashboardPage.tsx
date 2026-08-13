import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import type { DashboardStats, Project, ProjectRateSummary } from "../types";

const COLORS: Record<string, string> = {
  open: "#e11d48",
  in_progress: "#f59e0b",
  completed: "#3b82f6",
  verification_pending: "#8b5cf6",
  under_review: "#ea580c",
  closed: "#16a34a",
};

const PREVIEW_COUNT = 3;

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ProjectRateSummary>>({});
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectsPath = role === "admin" ? "/projects" : "/executive";
  const ratesPath = role === "admin" ? "/rates" : "/executive";
  const vendorsPath = role === "admin" || role === "government" ? "/vendors" : "/dashboard";

  useEffect(() => {
    if (!token) return;
    Promise.all([api.dashboard(token), api.projects(token)])
      .then(async ([s, p]) => {
        setStats(s);
        const sorted = [...p].sort((a, b) => b.id - a.id);
        setProjects(sorted);
        const entries = await Promise.all(
          sorted.map(async (proj) => {
            try {
              const sum = await api.projectRateSummary(token, proj.id);
              return [proj.id, sum] as const;
            } catch {
              return null;
            }
          })
        );
        const map: Record<number, ProjectRateSummary> = {};
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
        }
        setSummaries(map);
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

  const visibleProjects = useMemo(
    () => (showAllProjects ? projects : projects.slice(0, PREVIEW_COUNT)),
    [projects, showAllProjects]
  );

  const openProject = (project: Project) => {
    if (role === "admin") {
      navigate(`/projects?project=${project.id}`);
      return;
    }
    navigate(`${ratesPath}?project=${project.id}`);
  };

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
            <StatCard
              label="Projects"
              value={stats.total_projects}
              to="#latest-projects"
              hint="Latest projects ↓"
            />
            <StatCard label="Total issues" value={stats.total_issues} to="/issues" hint="Open Issues →" />
            <StatCard label="Invoices" value={stats.total_invoices ?? 0} to="/billing" hint="Open Billing →" />
            <StatCard label="Documents" value={stats.total_documents ?? 0} to="/documents" hint="Open Documents →" />
            <StatCard label="Staff details" value="GMC · NHIPMPL · Contractor" to="/staff-details" hint="Organisation professionals →" />
            <StatCard label="Query Raise" value="Tickets" to="/queries" hint="Raise / resolve portal queries →" />
            <StatCard label="RFI" value="Site clarifications" to="/rfi" hint="Raise / answer RFIs →" />
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

      <section className="panel" id="latest-projects">
        <div className="panel-head-row">
          <h2>Latest projects</h2>
          <Link className="btn ghost" to={projectsPath}>
            Open full list
          </Link>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Location</th>
              <th>Chainage</th>
              <th>Team</th>
              <th>BOQ amount</th>
              <th>Executed value</th>
              <th>% progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleProjects.map((p) => {
              const sum = summaries[p.id];
              return (
                <tr
                  key={p.id}
                  className="clickable-row"
                  onClick={() => openProject(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProject(p);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.location}</td>
                  <td>
                    {p.chainage_from || "—"} – {p.chainage_to || "—"}
                  </td>
                  <td>
                    {p.contractors.length} contractors · {p.surveyors.length} GMC representatives
                  </td>
                  <td>{sum ? `₹ ${money(sum.total_boq_amount)}` : "—"}</td>
                  <td>{sum ? `₹ ${money(sum.total_executed_amount)}` : "—"}</td>
                  <td>{sum?.progress_pct == null ? "—" : `${sum.progress_pct}%`}</td>
                  <td>
                    <Link
                      to={role === "admin" ? `/rates?project=${p.id}` : `${ratesPath}?project=${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Rates
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!projects.length ? (
              <tr>
                <td colSpan={9}>No projects yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {projects.length > PREVIEW_COUNT ? (
          <div className="show-more-row">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowAllProjects((v) => !v)}
            >
              {showAllProjects
                ? "Show less"
                : `Show more (${projects.length - PREVIEW_COUNT} more)`}
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}
