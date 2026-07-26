import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { Issue } from "../types";
import { CameraCapture, type CapturedShot } from "./CameraCapture";
import { StatusBadge } from "./StatusBadge";

type Props = {
  issueId: number;
  fallback?: Issue | null;
  onClose: () => void;
  onChanged?: () => void;
};

type CameraMode = "complete" | "approve" | "reject" | null;

export function IssueDetailPanel({ issueId, fallback, onClose, onChanged }: Props) {
  const { token, role, isReadonly } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(fallback || null);
  const [error, setError] = useState<string | null>(null);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [remarks, setRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectComments, setRejectComments] = useState("");

  const load = () => {
    if (!token) return;
    api
      .issue(token, issueId)
      .then((i) => {
        setIssue(i);
        setDeadlineDays(String(i.deadline_days));
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [token, issueId]);

  const canVerify =
    !isReadonly &&
    (role === "surveyor" || role === "admin") &&
    issue &&
    (issue.status === "completed" || issue.status === "verification_pending");

  const onShot = async (shot: CapturedShot) => {
    if (!token || !issue || !cameraMode) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", shot.blob, `capture_${Date.now()}.jpg`);
      if (cameraMode === "complete") {
        form.append("completion_lat", String(shot.lat));
        form.append("completion_lng", String(shot.lng));
        const note = [
          remarks.trim(),
          `Captured at ${shot.capturedAt}`,
          `GPS ${shot.lat.toFixed(6)}, ${shot.lng.toFixed(6)}`,
        ]
          .filter(Boolean)
          .join("\n");
        form.append("completion_remarks", note);
        const updated = await api.completeIssue(token, issue.id, form);
        setIssue(updated);
      } else if (cameraMode === "approve") {
        form.append("verification_lat", String(shot.lat));
        form.append("verification_lng", String(shot.lng));
        const updated = await api.approveIssue(token, issue.id, form);
        setIssue(updated);
      } else if (cameraMode === "reject") {
        form.append("verification_lat", String(shot.lat));
        form.append("verification_lng", String(shot.lng));
        form.append("reason", rejectReason.trim() || "Rework required");
        if (rejectComments.trim()) form.append("comments", rejectComments.trim());
        const updated = await api.rejectIssue(token, issue.id, form);
        setIssue(updated);
      }
      setCameraMode(null);
      setRemarks("");
      onChanged?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed");
      setCameraMode(null);
    } finally {
      setBusy(false);
    }
  };

  if (!issue) {
    return (
      <div className="drawer-backdrop" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <p>{error || "Loading…"}</p>
        </div>
      </div>
    );
  }

  const latestRejection = [...(issue.rejection_history || [])].sort(
    (a, b) => b.id - a.id
  )[0];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0 }}>
            #{issue.id} · {issue.issue_type}
            {issue.issue_type_label ? ` · ${issue.issue_type_label}` : ""}
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
            <dt>Report GPS</dt>
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
            <dd>{issue.work_category_label || issue.work_category}</dd>
          </div>
          {issue.completed_at ? (
            <div>
              <dt>Completed at</dt>
              <dd>{new Date(issue.completed_at).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>

        {issue.status === "under_review" && latestRejection ? (
          <div className="reject-box">
            <h3>Surveyor / admin comments (rework)</h3>
            <p>
              <strong>Reason:</strong> {latestRejection.reason}
            </p>
            {latestRejection.comments ? <p>{latestRejection.comments}</p> : null}
            <p className="muted">{new Date(latestRejection.created_at).toLocaleString()}</p>
            {latestRejection.photo_path ? (
              <img src={mediaUrl(latestRejection.photo_path)} alt="Rejection" />
            ) : null}
          </div>
        ) : null}

        <div className="photos" style={{ marginTop: 16 }}>
          <h3>Before (surveyor)</h3>
          <img src={mediaUrl(issue.before_photo_path)} alt="Before" />
          {issue.completion_photo_path ? (
            <>
              <h3>After (contractor submit)</h3>
              <img src={mediaUrl(issue.completion_photo_path)} alt="After" />
              {issue.completion_remarks ? (
                <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  {issue.completion_remarks}
                </p>
              ) : null}
            </>
          ) : null}
          {issue.verification_photo_path ? (
            <>
              <h3>Verification</h3>
              <img src={mediaUrl(issue.verification_photo_path)} alt="Verification" />
            </>
          ) : null}
        </div>

        {cameraMode ? (
          <CameraCapture
            title={
              cameraMode === "complete"
                ? "Submit work (camera + GPS)"
                : cameraMode === "approve"
                  ? "Approve verification"
                  : "Reject / rework photo"
            }
            onCapture={onShot}
            onCancel={() => setCameraMode(null)}
          />
        ) : (
          <div className="actions-stack">
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
                Mark In Progress
              </button>
            ) : null}

            {!isReadonly && role === "contractor" && issue.status === "under_review" ? (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  try {
                    const updated = await api.reworkStart(token, issue.id);
                    setIssue(updated);
                    onChanged?.();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : "Failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Start rework (after comments)
              </button>
            ) : null}

            {!isReadonly && role === "contractor" && issue.status === "in_progress" ? (
              <>
                <label>
                  Description / remarks (saved with submit)
                  <textarea
                    rows={3}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="What work was done?"
                  />
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => setCameraMode("complete")}
                >
                  Submit (camera + GPS + date)
                </button>
              </>
            ) : null}

            {canVerify ? (
              <>
                <p className="muted">
                  Verify within 24 hours of completion. Approve to close, or reject with comments for
                  contractor rework.
                </p>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => setCameraMode("approve")}
                >
                  Approve & close (camera + GPS)
                </button>
                <label>
                  Rejection reason
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why rework is needed"
                  />
                </label>
                <label>
                  Comments for contractor
                  <textarea
                    rows={3}
                    value={rejectComments}
                    onChange={(e) => setRejectComments(e.target.value)}
                    placeholder="Visible to contractor on next visit"
                  />
                </label>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (!rejectReason.trim()) {
                      setError("Rejection reason is required");
                      return;
                    }
                    setCameraMode("reject");
                  }}
                >
                  Reject / send for rework
                </button>
              </>
            ) : null}

            {!isReadonly && role === "admin" ? (
              <div className="form-grid">
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

            {isReadonly ? (
              <p className="muted">Government account is view-only.</p>
            ) : null}
          </div>
        )}

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
