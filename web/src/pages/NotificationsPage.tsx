import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Notification } from "../api";
import { useAuth } from "../auth";

export function NotificationsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token) return;
    api
      .notifications(token)
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Notifications";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const openIssue = async (n: Notification) => {
    if (!token) return;
    if (!n.is_read) {
      try {
        await api.markNotificationRead(token, n.id);
      } catch {
        /* ignore */
      }
    }
    if (n.issue_id) navigate(`/issues?id=${n.issue_id}`);
    else load();
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <section className="panel">
        <div className="panel-head-row">
          <h2>Alerts</h2>
          <button
            className="btn ghost"
            type="button"
            disabled={busy || !items.some((n) => !n.is_read)}
            onClick={async () => {
              if (!token) return;
              setBusy(true);
              try {
                await api.markAllNotificationsRead(token);
                load();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark all read
          </button>
        </div>
        <ul className="notify-list">
          {items.map((n) => (
            <li key={n.id} className={n.is_read ? "read" : "unread"}>
              <button type="button" className="notify-item" onClick={() => openIssue(n)}>
                <strong>{n.title}</strong>
                <span>{n.message}</span>
                <small>
                  {new Date(n.created_at).toLocaleString()}
                  {n.issue_id ? ` · Issue #${n.issue_id}` : ""}
                </small>
              </button>
            </li>
          ))}
          {!items.length ? <li className="muted">No notifications yet.</li> : null}
        </ul>
        <p className="muted" style={{ marginTop: "1rem" }}>
          Tip: contractors can also act from the Issues list (Start / Submit / View comments).{" "}
          <Link to="/issues">Open issues</Link>
        </p>
      </section>
    </>
  );
}
