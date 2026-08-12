import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
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
        <div className="brand">
          Road<span>Service</span>
        </div>
        <DeveloperCredit className="compact sidebar-credit-top" />
        <nav>
          <NavLink to="/dashboard" end>
            Dashboard
          </NavLink>
          <NavLink to="/staff-details">Staff Details</NavLink>
          {staff ? <NavLink to="/queries">Query Raise</NavLink> : null}
          {staff ? <NavLink to="/rfi">RFI</NavLink> : null}
          {staff ? <NavLink to="/executive">Executive</NavLink> : null}
          <NavLink to="/issues">Issues</NavLink>
          {staff ? <NavLink to="/billing">Billing</NavLink> : null}
          {staff ? <NavLink to="/contractor-billing">Contractor Billing</NavLink> : null}
          {staff ? <NavLink to="/documents">Documents</NavLink> : null}
          {staff ? <NavLink to="/mpr">MPR</NavLink> : null}
          {role === "government" ? <NavLink to="/attendance">Attendance</NavLink> : null}
          {staff ? <NavLink to="/toll">Toll Ops</NavLink> : null}
          {staff ? <NavLink to="/highway-incidents">Incidents</NavLink> : null}
          {staff ? <NavLink to="/its">ATMS/TMS/ITS</NavLink> : null}
          {staff ? <NavLink to="/civil-assets">Civil Assets</NavLink> : null}
          {adminGov ? <NavLink to="/integrations">Integrations</NavLink> : null}
          {adminGov ? <NavLink to="/backup-dr">Backup/DR</NavLink> : null}
          {adminGov ? <NavLink to="/vendors">Vendors</NavLink> : null}
          {staff ? <NavLink to="/security">Security</NavLink> : null}
          <NavLink to="/notifications">
            Notifications{unread ? ` (${unread})` : ""}
          </NavLink>
          <NavLink to="/map">Map</NavLink>
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
          <div className="user-chip">
            {fullName}
            <small>{roleLabel(role)}</small>
          </div>
          <button className="linkish" type="button" onClick={toggleTheme}>
            Switch to {theme === "dark" ? "Light" : "Dark"} mode
          </button>
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
          <h1 id="page-title">RoadService</h1>
          <button className="theme-toggle" type="button" onClick={toggleTheme}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          {isReadonly ? <span className="badge view-only">View only</span> : null}
          {unread ? <span className="badge status-verification_pending">{unread} new</span> : null}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
