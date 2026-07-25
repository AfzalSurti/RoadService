import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { Issue } from "../types";
import { StatusBadge, formatLabel } from "./StatusBadge";

type Props = {
  issueId: number;
  fallback?: Issue | null;
  onClose: () => void;
  onChanged?: () => void;
};

export function IssueDetailPanel({ issueId, fallback, onClose, onChanged }: Props) {
  const { token, role, isReadonly } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(fallback || null);
  const [error, setError] = useState<string | null>(null);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .issue(token, issueId)
      .then((i) => {
        setIssue(i);
        setDeadlineDays(String(i.deadline_days));
      })
      .catch((e: Error) => setError(e.message));
  }, [token, issueId]);

  if (!issue) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <p>{error || "Loading…"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0 }}>
            #{issue.id} · {formatLabel(issue.issue_type)}
          </h2>
          <button className="btn ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <p className="muted">{issue.description}</p>
        <dl className="meta">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={issue.status} />
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{issue.priority}</dd>
          </div>
          <div>
            <dt>Chainage</dt>
            <dd>{issue.chainage || "—"}</dd>
          </div>
          <div>
            <dt>GPS</dt>
            <dd>
              {issue.before_lat.toFixed(5)}, {issue.before_lng.toFixed(5)}
            </dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {issue.deadline_date} ({issue.remaining_days ?? "?"} days)
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{formatLabel(issue.work_category)}</dd>
          </div>
        </dl>

        <div className="photos" style={{ marginTop: 16 }}>
          <h3>Before</h3>
          <img src={mediaUrl(issue.before_photo_path)} alt="Before" />
          {issue.completion_photo_path ? (
            <>
              <h3>After</h3>
              <img src={mediaUrl(issue.completion_photo_path)} alt="After" />
            </>
          ) : null}
          {issue.verification_photo_path ? (
            <>
              <h3>Verification</h3>
              <img src={mediaUrl(issue.verification_photo_path)} alt="Verification" />
            </>
          ) : null}
        </div>

        {!isReadonly && role === "contractor" && issue.status === "open" ? (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!token) return;
              setBusy(true);
              try {
                const updated = await api.startIssue(token, issue.id);
                setIssue(updated);
                onChanged?.();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Start work
          </button>
        ) : null}

        {!isReadonly && role === "admin" ? (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label>
              Change deadline (days)
              <input value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} />
            </label>
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!token) return;
                setBusy(true);
                try {
                  const updated = await api.adminUpdateIssue(token, issue.id, {
                    deadline_days: Number(deadlineDays),
                  });
                  setIssue(updated);
                  onChanged?.();
                } catch (e: unknown) {
                  setError(e instanceof Error ? e.message : "Failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Update deadline
            </button>
          </div>
        ) : null}

        <h3>Audit trail</h3>
        <ul className="timeline">
          {issue.status_history.map((h) => (
            <li key={h.id}>
              <strong>
                {h.from_status || "—"} → {h.to_status}
              </strong>
              <span>
                {h.created_at} · actor {h.actor_id ?? "system"}
              </span>
              {h.note ? <p>{h.note}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
