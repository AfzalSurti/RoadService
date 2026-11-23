import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { roleLabel } from "../lib/roles";
import { PasswordModal } from "./PasswordModal";

/** Top-right account button: name and role, with Change password and Log out. */
export function AccountMenu() {
  const { fullName, role, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = (fullName || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const signOut = () => {
    if (!window.confirm("Log out of RoadService?")) return;
    logout();
    navigate("/login");
  };

  return (
    <div className="account-menu" ref={box}>
      <button
        type="button"
        className="account-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="account-avatar">{initials}</span>
        <span className="account-text">
          <span className="topbar-name">{fullName}</span>
          <small>{roleLabel(role)}</small>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="account-dropdown" role="menu">
          <div className="account-head">
            <strong>{fullName}</strong>
            <small>{roleLabel(role)}</small>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setPwOpen(true);
            }}
          >
            🔑 Change password
          </button>
          <button type="button" role="menuitem" className="account-logout" onClick={signOut}>
            ⎋ Log out
          </button>
        </div>
      ) : null}
      {pwOpen ? <PasswordModal mode="self" onClose={() => setPwOpen(false)} /> : null}
    </div>
  );
}
