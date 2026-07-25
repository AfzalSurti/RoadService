import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function AppLayout() {
  const { fullName, role, isReadonly, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Road<span>Service</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/issues">Issues</NavLink>
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
              navigate("/login");
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
        </div>
        <Outlet />
      </main>
    </div>
  );
}
