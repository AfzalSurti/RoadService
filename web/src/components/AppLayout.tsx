import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

export function AppLayout() {
  const { token, fullName, role, isReadonly, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

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
        <nav>
          <NavLink to="/dashboard" end>
            Dashboard
          </NavLink>
          <NavLink to="/issues">Issues</NavLink>
          <NavLink to="/notifications">
            Notifications{unread ? ` (${unread})` : ""}
          </NavLink>
          <NavLink to="/map">Map</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {role === "admin" ? (
            <>
              <NavLink to="/projects">Projects</NavLink>
              <NavLink to="/users">Users</NavLink>
            </>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            {fullName}
            <small>{role}</small>
          </div>
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
          {isReadonly ? <span className="badge view-only">View only</span> : null}
          {unread ? <span className="badge status-verification_pending">{unread} new</span> : null}
        </div>
        <Outlet />
      </main>
    </div>
  );
}
