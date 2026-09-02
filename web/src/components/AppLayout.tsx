import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { BackButton } from "./BackButton";
import { DeveloperCredit } from "./DeveloperCredit";
import { roleLabel } from "../lib/roles";
import { useTheme } from "../theme";

export function AppLayout() {
  const { token, fullName, role, isReadonly, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const staff = role === "admin" || role === "contractor" || role === "government";
  const adminGov = role === "admin" || role === "government";
  const billingRoles = role === "admin" || role === "government" || role === "contractor";

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
          <NavLink to="/dashboard" end>
            Dashboard
          </NavLink>

          <div className="nav-group-label">Civil Dashboard</div>
          {staff ? <NavLink to="/civil-assets">Civil Assets</NavLink> : null}
          <NavLink to="/issues">Issues</NavLink>
          {staff ? <NavLink to="/mpr">MPR</NavLink> : null}
          <NavLink to="/map">Map</NavLink>

          <div className="nav-group-label">TMS Dashboard</div>
          {staff ? <NavLink to="/toll">Toll Ops</NavLink> : null}
          {staff ? <NavLink to="/highway-incidents">Incidents</NavLink> : null}
          {staff ? <NavLink to="/its">ATMS/TMS/ITS</NavLink> : null}

          {adminGov ? (
            <>
              <div className="nav-group-label">ATMS Dashboard</div>
              <NavLink to="/integrations">Integrations</NavLink>
              <NavLink to="/backup-dr">Backup/DR</NavLink>
            </>
          ) : null}

          <div className="nav-group-label">General / MIS</div>
          <NavLink to="/staff-details">Staff Details</NavLink>
          {staff ? <NavLink to="/queries">Query Raise</NavLink> : null}
          {staff ? <NavLink to="/rfi">RFI</NavLink> : null}
          {staff ? <NavLink to="/executive">Executive</NavLink> : null}
          {adminGov ? <NavLink to="/billing">Billing</NavLink> : null}
          {billingRoles ? <NavLink to="/contractor-billing">Contractor Billing</NavLink> : null}
          {staff ? <NavLink to="/documents">Documents</NavLink> : null}
          {adminGov ? <NavLink to="/attendance">Attendance</NavLink> : null}
          {adminGov ? <NavLink to="/vendors">Vendors</NavLink> : null}
          {staff ? <NavLink to="/security">Security</NavLink> : null}
          <NavLink to="/notifications">
            Notifications{unread ? ` (${unread})` : ""}
          </NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {role === "admin" ? (
            <>
              <NavLink to="/projects">Projects</NavLink>
              <NavLink to="/rates">Rates</NavLink>
              <NavLink to="/users">Users</NavLink>
            </>
          ) : null}
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
