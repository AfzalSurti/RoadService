import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { BackButton } from "./BackButton";
import { DeveloperCredit } from "./DeveloperCredit";
import { PackageScopePicker } from "./PackageScopePicker";
import { usePackageScope, withProjectQuery } from "../lib/projectScope";
import { roleLabel } from "../lib/roles";
import type { Project } from "../types";
import { useTheme } from "../theme";

export function AppLayout() {
  const { token, fullName, role, isReadonly, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const staff = role === "admin" || role === "contractor" || role === "government";
  const adminGov = role === "admin" || role === "government";
  const billingRoles = role === "admin" || role === "government" || role === "contractor";
  const location = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);

  // Package scope (all / one / several) applies to every module. With exactly one
  // package, project-aware links also carry ?project= so pages open on it.
  const { scopeIds, setScope } = usePackageScope();
  const activeIds = (scopeIds || []).filter((id) => projects.some((p) => p.id === id));
  const single = activeIds.length === 1 ? activeIds[0] : null;
  const scoped = (path: string) => (single ? withProjectQuery(path, single) : path);

  const changeScope = (ids: number[] | null) => {
    setScope(ids);
    // Keep the open page in step: one package → ?project=id, otherwise drop it.
    const next = new URLSearchParams(location.search);
    next.delete("all");
    if (ids && ids.length === 1) next.set("project", String(ids[0]));
    else next.delete("project");
    const qs = next.toString();
    navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
  };

  useEffect(() => {
    if (!token) return;
    api
      .projects(token)
      .then(setProjects)
      .catch(() => setProjects([]));
    // Refresh on navigation so renamed / removed packages show up right away.
  }, [token, location.pathname]);

  useEffect(() => {
    if (!token) return;
    const load = () =>
      api
        .notifications(token, true)
        .then((n) => setUnread(n.length))
        .catch(() => setUnread(0));
    load();
    const id = window.setInterval(load, 30000);
    return () => window.clearInterval(id);
  }, [token]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">
            Road<span>Service</span>
          </div>
          <div className="user-chip">
            {fullName}
            <small>{roleLabel(role)}</small>
          </div>
          <button className="linkish theme-link" type="button" onClick={toggleTheme}>
            Switch to {theme === "dark" ? "Light" : "Dark"} mode
          </button>
        </div>
        <nav>
          <NavLink to="/dashboard" end state={{ hero: true }}>
            Dashboard
          </NavLink>
          {projects.length > 1 ? (
            <PackageScopePicker projects={projects} scopeIds={scopeIds} onChange={changeScope} />
          ) : null}

          <div className="nav-group-label">Civil Dashboard</div>
          {staff ? <NavLink to={scoped("/civil-assets")}>Project Inventory</NavLink> : null}
          <NavLink to={scoped("/issues")}>Issues</NavLink>
          {staff ? <NavLink to={scoped("/rfi")}>RFI</NavLink> : null}
          {staff ? <NavLink to={scoped("/mpr")}>MPR</NavLink> : null}
          {staff ? <NavLink to={scoped("/executive")}>Project Overview</NavLink> : null}
          {adminGov ? <NavLink to="/vendors">Vendors</NavLink> : null}
          <NavLink to={scoped("/map")}>Map</NavLink>

          <div className="nav-group-label">TMS Dashboard</div>
          {staff ? <NavLink to="/toll">Toll Ops</NavLink> : null}
          {staff ? <NavLink to="/highway-incidents">Incidents</NavLink> : null}
          {staff ? <NavLink to="/its">ATMS/TMS/ITS</NavLink> : null}

          {adminGov ? (
            <>
              <div className="nav-group-label">ATMS Dashboard</div>
              <NavLink to="/integrations">Integrations</NavLink>
              <NavLink to="/backup-dr">Backup/DR</NavLink>
              <NavLink to="/vendors">Vendors</NavLink>
            </>
          ) : null}

          <div className="nav-group-label">General / MIS</div>
          <NavLink to="/staff-details">Staff Details</NavLink>
          {staff ? <NavLink to={scoped("/queries")}>Query Raise</NavLink> : null}
          {adminGov ? <NavLink to="/billing">GMC Billing</NavLink> : null}
          {billingRoles ? <NavLink to="/contractor-billing">Contractor Billing</NavLink> : null}
          {staff ? <NavLink to="/documents">Documents</NavLink> : null}
          {adminGov ? <NavLink to="/attendance">Attendance</NavLink> : null}
          {staff ? <NavLink to="/security">Security</NavLink> : null}
          <NavLink to="/notifications">
            Notifications{unread ? ` (${unread})` : ""}
          </NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {adminGov ? (
            <>
              <NavLink to={scoped("/projects")}>Projects</NavLink>
              <NavLink to={scoped("/rates")}>BOQ</NavLink>
            </>
          ) : null}
          {role === "admin" ? <NavLink to="/users">Users</NavLink> : null}
        </nav>
        <div className="sidebar-foot">
          <button
            className="linkish"
            type="button"
            onClick={() => {
              logout();
              navigate("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <BackButton />
          <h1 id="page-title">RoadService</h1>
          <DeveloperCredit className="navbar" />
          <div className="topbar-actions">
            <div className="topbar-user">
              <span className="topbar-name">{fullName}</span>
              <small>{roleLabel(role)}</small>
            </div>
            <button className="theme-toggle" type="button" onClick={toggleTheme}>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {isReadonly ? <span className="badge view-only">View only</span> : null}
            {unread ? <span className="badge status-verification_pending">{unread} new</span> : null}
          </div>
        </div>
        <div className="main-scroll">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
