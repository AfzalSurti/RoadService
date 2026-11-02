import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
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
import { PackageWorks } from "../components/PackageWorks";
import {
  projectImageUrl,
  projectShortName,
  projectTitle,
  resolveProjectId,
  setSelectedProjectId,
  usePackageScope,
  withProjectQuery,
} from "../lib/projectScope";
import type { DashboardStats, Project, ProjectRateSummary, Vendor } from "../types";

const COLORS: Record<string, string> = {
  open: "#e11d48",
  in_progress: "#f59e0b",
  completed: "#3b82f6",
  verification_pending: "#8b5cf6",
  under_review: "#ea580c",
  closed: "#16a34a",
};

const PREVIEW_COUNT = 3;


function HighwayIcon() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 6 9 42" />
      <path d="M31 6l8 36" />
      <path d="M24 8v5M24 19v5M24 30v5M24 40v2" />
    </svg>
  );
}

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
  const { token, role, isReadonly } = useAuth();
  const [params, setParams] = useSearchParams();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ProjectRateSummary>>({});
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    resolveProjectId(params.get("project"))
  );
  const [showAllProjects, setShowAllProjects] = useState(false);
  // Splash photo shows on every visit to the dashboard; clicking it reveals the
  // dashboard as it was left (selected project is kept via URL / projectScope).
  // Splash on every visit, except when a package was picked in the portal search.
  const arrivedFromSearch = Boolean((useLocation().state as { skipHero?: boolean } | null)?.skipHero);
  const [showHero, setShowHero] = useState(!arrivedFromSearch);
  // Package whose overview is shown on the splash (hover / keyboard focus).
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // GMC Experts edit, NHIPMPL views the same package details / BOQ read-only.
  const canSeePackagePages = role === "admin" || role === "government";
  const projectsPath = canSeePackagePages ? "/projects" : "/executive";
  const ratesPath = canSeePackagePages ? "/rates" : "/executive";
  const vendorsPath = role === "admin" || role === "government" ? "/vendors" : "/dashboard";

  useEffect(() => {
    if (!token) return;
    api
      .projects(token)
      .then(async (p) => {
        const sorted = [...p].sort((a, b) => a.id - b.id);
        setProjects(sorted);
        setError(null);
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

  // Vendor picked in the Works tabs: cards and charts narrow to its contractor login.
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const vendorContractorId = selectedVendor?.contractor_user_id ?? null;
  useEffect(() => {
    setSelectedVendor(null);
  }, [selectedId]);

  useEffect(() => {
    if (!token || !selectedId) {
      setStats(null);
      return;
    }
    api
      .dashboard(token, selectedId, vendorContractorId)
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, [token, selectedId, vendorContractorId]);

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

  const selected = useMemo(
    () => (selectedId ? projects.find((p) => p.id === selectedId) || null : null),
    [projects, selectedId]
  );

  // Sidebar package picker: one package opens it; several / all show the list.
  const { scopeIds, inScope } = usePackageScope();
  useEffect(() => {
    if (scopeIds && scopeIds.length === 1) {
      if (selectedId !== scopeIds[0]) setSelectedId(scopeIds[0]);
      return;
    }
    if (selectedId && (!scopeIds || !scopeIds.includes(selectedId))) setSelectedId(null);
  }, [scopeIds]);

  const scopedCount = projects.filter((p) => inScope(p.id)).length;

  // A package picked from the splash shows on its own; switch via "Change package".
  const visibleProjects = useMemo(() => {
    if (selected) return [selected];
    const list = projects.filter((p) => inScope(p.id));
    return showAllProjects ? list : list.slice(0, PREVIEW_COUNT);
  }, [projects, showAllProjects, selected, inScope]);

  // Sidebar "Dashboard" link sends { hero } state: go back to the package icons
  // even when the dashboard is already open.
  const location = useLocation();
  useEffect(() => {
    if ((location.state as { hero?: unknown } | null)?.hero) setShowHero(true);
  }, [location.key]);
  const selectedSum = selectedId ? summaries[selectedId] : undefined;

  const openProject = (project: Project) => {
    setSelectedId(project.id);
    setSelectedProjectId(project.id);
    const next = new URLSearchParams(params);
    next.set("project", String(project.id));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = selected ? `Dashboard · ${projectShortName(selected)}` : "Dashboard";
  }, [selected]);

  // Drop a stale selection (e.g. a retired project still in session storage).
  useEffect(() => {
    if (projects.length && selectedId && !projects.some((p) => p.id === selectedId)) {
      setSelectedId(null);
      setSelectedProjectId(null);
    }
  }, [projects, selectedId]);

  const pid = selectedId;
  const preview = previewId ? projects.find((p) => p.id === previewId) || null : null;

  if (showHero) {
    return (
      <div
        className="dash-hero"
        role="button"
        tabIndex={0}
        onClick={() => setShowHero(false)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setShowHero(false);
          }
        }}
        title="Open the dashboard"
        aria-label="Open the dashboard"
      >
        <span className="dash-hero-bg" />
        <span className="dash-hero-wash" />
        <div className="dash-hero-inner">
          <div
            className={`dash-hero-tiles${preview ? " is-previewing" : ""}`}
            onMouseLeave={() => setPreviewId(null)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPreviewId(null);
            }}
          >
            {(preview ? [preview] : projects).map((p) => (
              <button
                key={p.id}
                type="button"
                className="dash-hero-tile"
                onMouseEnter={() => setPreviewId(p.id)}
                onFocus={() => setPreviewId(p.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  openProject(p);
                  setShowHero(false);
                }}
              >
                {projectImageUrl(p) ? (
                  <span
                    className="dash-hero-photo"
                    aria-hidden="true"
                    style={{ backgroundImage: `url("${projectImageUrl(p)}")` }}
                  />
                ) : (
                  <span className="dash-hero-icon" aria-hidden="true">
                    <HighwayIcon />
                  </span>
                )}
                <span className="dash-hero-tile-name">
                  <span className="dash-hero-tile-no">{projects.indexOf(p) + 1}</span>
                  {projectShortName(p)}
                </span>
                {preview ? <span className="dash-hero-tile-cta">Open package →</span> : null}
              </button>
            ))}
            {preview ? (
              <div className="dash-hero-details" onClick={(e) => e.stopPropagation()}>
                <h3>{projectTitle(preview)}</h3>
                <p className="dash-hero-details-meta">
                  {preview.location}
                  {preview.chainage_from || preview.chainage_to
                    ? ` · Ch. ${preview.chainage_from || "—"} – ${preview.chainage_to || "—"}`
                    : ""}
                </p>
                {(preview.description || "")
                  .split(/\n\s*\n/)
                  .map((para) => para.trim())
                  .filter(Boolean)
                  .map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                {!preview.description ? (
                  <p className="dash-hero-details-meta">No overview added yet.</p>
                ) : null}
                {role === "admin" && !isReadonly ? (
                  <Link className="dash-hero-edit" to={`/projects?project=${preview.id}&edit=1`}>
                    Edit details
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <section className="panel" id="latest-projects">
        <div className="panel-head-row">
          <h2>{selected ? "Package" : "Projects"}</h2>
          <div className="btn-row">
            <button type="button" className="btn ghost" onClick={() => setShowHero(true)}>
              ← Change package
            </button>
            <Link className="btn ghost" to={projectsPath}>
              Open full list
            </Link>
          </div>
        </div>
        <p className="muted">
          {selected
            ? "Showing this package only. Use “Change package” to pick another one."
            : "Select a project to open its Issues, RFI, Query Raise, rates and other modules."}
        </p>
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
                  className={`clickable-row${selectedId === p.id ? " row-active" : ""}`}
                  onClick={() => openProject(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openProject(p);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td>{p.id}</td>
                  <td className="project-name-cell">
                    <strong>{projectShortName(p)}</strong>
                    {p.title ? <span className="muted">{p.title}</span> : null}
                  </td>
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
                      to={withProjectQuery(ratesPath, p.id)}
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
        {!selected && scopedCount > PREVIEW_COUNT ? (
          <div className="show-more-row">
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowAllProjects((v) => !v)}
            >
              {showAllProjects
                ? "Show less"
                : `Show more (${scopedCount - PREVIEW_COUNT} more)`}
            </button>
          </div>
        ) : null}
      </section>

      {!selected ? (
        <p className="muted">Click a project row above to see that package’s dashboard.</p>
      ) : (
        <>
          <section className="panel">
            <div className="selected-project-banner">
              <div>
                <strong>
                  Selected · #{selected.id} · {projectShortName(selected)}
                </strong>
                {selected.title ? <p>{selected.title}</p> : null}
                <p>
                  {selected.location}
                  {selected.chainage_from || selected.chainage_to
                    ? ` · ${selected.chainage_from || "—"} – ${selected.chainage_to || "—"}`
                    : ""}
                </p>
                <p className="muted" style={{ marginTop: "0.35rem" }}>
                  {selected.contractors.length} contractors · {selected.surveyors.length} GMC
                  representatives
                  {selectedSum
                    ? ` · BOQ ₹ ${money(selectedSum.total_boq_amount)} · Executed ₹ ${money(
                        selectedSum.total_executed_amount
                      )}`
                    : ""}
                </p>
              </div>
              <div className="btn-row">
                {role === "admin" && !isReadonly ? (
                  <Link className="btn" to={`/projects?project=${selected.id}&edit=1`}>
                    Edit project
                  </Link>
                ) : null}
                <button type="button" className="btn ghost" onClick={() => setShowHero(true)}>
                  ← Change package
                </button>
              </div>
            </div>
          </section>

          {/* Works by category (from Vendors); GMC representatives have no vendor access. */}
          {role !== "surveyor" ? (
            <PackageWorks
              key={selected.id}
              projectId={selected.id}
              selectedVendorId={selectedVendor?.id ?? null}
              onSelectVendor={role === "admin" || role === "government" ? setSelectedVendor : undefined}
            />
          ) : null}

          {selectedVendor ? (
            <div className={`vendor-scope${vendorContractorId ? "" : " warn"}`}>
              <div>
                {vendorContractorId ? (
                  <>
                    Showing data for vendor <strong>{selectedVendor.name}</strong> — issues assigned to its
                    contractor login, its invoices, documents and recorded BOQ quantities.
                  </>
                ) : (
                  <>
                    <strong>{selectedVendor.name}</strong> is not linked to a contractor login yet, so the cards
                    below still show the whole package.
                    {role === "admin" ? " Edit the vendor in Vendors and pick its contractor login." : ""}
                  </>
                )}
              </div>
              <button type="button" className="btn ghost" onClick={() => setSelectedVendor(null)}>
                Show whole package
              </button>
            </div>
          ) : null}

          {stats ? (
            <>
              <section className="stat-grid">
                <StatCard
                  label="This project"
                  value={projectShortName(selected)}
                  to={withProjectQuery(projectsPath, pid)}
                  hint="Project page →"
                />
                <StatCard
                  label="Total issues"
                  value={stats.total_issues}
                  to={withProjectQuery("/issues", pid)}
                  hint="This project’s issues →"
                />
                {role === "admin" || role === "government" ? (
                  <StatCard
                    label="Invoices"
                    value={stats.total_invoices ?? 0}
                    to={withProjectQuery("/billing", pid)}
                    hint="Open GMC Billing →"
                  />
                ) : null}
                <StatCard
                  label="Documents"
                  value={stats.total_documents ?? 0}
                  to={withProjectQuery("/documents", pid)}
                  hint="Open Documents →"
                />
                <StatCard
                  label="Staff details"
                  value="GMC · NHIPMPL · Contractor"
                  to="/staff-details"
                  hint="Organisation professionals →"
                />
                <StatCard
                  label="Query Raise"
                  value="Tickets"
                  to={withProjectQuery("/queries", pid)}
                  hint="This project’s queries →"
                />
                <StatCard
                  label="RFI"
                  value="Request for Inspection"
                  to={withProjectQuery("/rfi", pid)}
                  hint="This project’s inspection requests →"
                />
                <StatCard
                  label="Project Overview"
                  value="Summary"
                  to={withProjectQuery("/executive", pid)}
                  hint="Project overview for package →"
                />
                <StatCard
                  label="MSR"
                  value="Progress"
                  to={withProjectQuery("/mpr", pid)}
                  hint="Open MSR →"
                />
                <StatCard
                  label="Map"
                  value="Locations"
                  to={withProjectQuery("/map", pid)}
                  hint="Map for this project →"
                />
                <StatCard
                  label="Vendors"
                  value={stats.total_vendors ?? 0}
                  to={vendorsPath}
                  hint="Open Vendors →"
                />
                <StatCard
                  label="BOQ amount ₹"
                  value={(stats.total_boq_amount ?? 0).toLocaleString("en-IN")}
                  to={withProjectQuery(ratesPath, pid)}
                  hint="Open BOQ →"
                />
                <StatCard
                  label="Executed ₹"
                  value={(stats.total_executed_amount ?? 0).toLocaleString("en-IN")}
                  to={withProjectQuery(ratesPath, pid)}
                  hint="Open BOQ →"
                />
                <StatCard
                  label="Delayed issues"
                  value={stats.delayed_issues}
                  to={withProjectQuery("/issues", pid)}
                  hint="This project’s issues →"
                />
                <StatCard
                  label="Compliance"
                  value={
                    stats.timeline_compliance_pct != null
                      ? `${stats.timeline_compliance_pct}%`
                      : "—"
                  }
                  to={withProjectQuery("/reports", pid)}
                  hint="Open Reports →"
                />
              </section>

              <section className="charts">
                <div className="panel">
                  <h2>
                    Issue status · {projectShortName(selected)}
                    {selectedVendor && vendorContractorId ? ` · ${selectedVendor.name}` : ""}
                  </h2>
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={90}
                        >
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
                  <h2>
                    Contractor performance · {projectShortName(selected)}
                    {selectedVendor && vendorContractorId ? ` · ${selectedVendor.name}` : ""}
                  </h2>
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
          ) : (
            <p className="muted">Loading project dashboard…</p>
          )}
        </>
      )}
    </>
  );
}
