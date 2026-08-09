import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import * as v from "../lib/validation";
import type { Issue } from "../types";
import { CameraCapture, type CapturedShot } from "./CameraCapture";
import { StatusBadge } from "./StatusBadge";

type Props = {
  issueId: number;
  fallback?: Issue | null;
  focusAction?: string | null;
  onClose: () => void;
  onChanged?: () => void;
};

type CameraMode = "complete" | "approve" | "reject" | null;

export function IssueDetailPanel({ issueId, fallback, focusAction, onClose, onChanged }: Props) {
  const { token, role, isReadonly } = useAuth();
  const [issue, setIssue] = useState<Issue | null>(fallback || null);
  const [error, setError] = useState<string | null>(null);
  const [deadlineDays, setDeadlineDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(null);
  const [remarks, setRemarks] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectComments, setRejectComments] = useState("");
  const [fieldErrors, setFieldErrors] = useState<v.FieldErrors>({});
  const [highlightRejection, setHighlightRejection] = useState(false);

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

  useEffect(() => {
    if (!focusAction || !issue) return;
    if (focusAction === "submit" && issue.status === "in_progress") {
      // Scroll/focus remarks — contractor taps Submit from list
      document.getElementById("submit-remarks")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (focusAction === "rejection") {
      setHighlightRejection(true);
      document.getElementById("rejection-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusAction, issue?.id, issue?.status]);

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
          <div
            id="rejection-box"
            className={`reject-box${highlightRejection ? " reject-box-focus" : ""}`}
          >
            <h3>GMC representative / GMC Experts comments (rework)</h3>
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

        <div className="photo-stage-grid">
          <article className="photo-stage">
            <h3>1 · GMC representative (before)</h3>
            <p className="muted">Captured while surveying the defect</p>
            {issue.before_photo_path ? (
              <img src={mediaUrl(issue.before_photo_path)} alt="GMC representative before photo" />
            ) : (
              <div className="photo-empty">No GMC representative photo</div>
            )}
          </article>
          <article className="photo-stage">
            <h3>2 · Contractor (submit)</h3>
            <p className="muted">Proof photo after repair work</p>
            {issue.completion_photo_path ? (
              <>
                <img src={mediaUrl(issue.completion_photo_path)} alt="Contractor after photo" />
                {issue.completion_remarks ? (
                  <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                    {issue.completion_remarks}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="photo-empty">Awaiting contractor submit</div>
            )}
          </article>
          <article className="photo-stage">
            <h3>3 · Final (closed)</h3>
            <p className="muted">Verification photo when issue is closed</p>
            {issue.verification_photo_path ? (
              <img src={mediaUrl(issue.verification_photo_path)} alt="Final closed photo" />
            ) : (
              <div className="photo-empty">
                {issue.status === "closed" ? "No final photo" : "Not closed yet"}
              </div>
            )}
          </article>
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
                <label id="submit-remarks">
                  Description / remarks (saved with submit)
                  <textarea
                    rows={3}
                    value={remarks}
                    aria-invalid={Boolean(fieldErrors.remarks)}
                    onChange={(e) => {
                      setRemarks(e.target.value);
                      if (fieldErrors.remarks) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.remarks;
                          return next;
                        });
                      }
                    }}
                    placeholder="What work was done?"
                  />
                  {fieldErrors.remarks ? <span className="field-error">{fieldErrors.remarks}</span> : null}
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const remarksErr = v.minLength(remarks, 5, "Remarks");
                    if (remarksErr) {
                      setFieldErrors({ remarks: remarksErr });
                      setError(remarksErr);
                      return;
                    }
                    setFieldErrors({});
                    setError(null);
                    setCameraMode("complete");
                  }}
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
                    aria-invalid={Boolean(fieldErrors.rejectReason)}
                    onChange={(e) => {
                      setRejectReason(e.target.value);
                      if (fieldErrors.rejectReason) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.rejectReason;
                          return next;
                        });
                      }
                    }}
                    placeholder="Why rework is needed"
                  />
                  {fieldErrors.rejectReason ? (
                    <span className="field-error">{fieldErrors.rejectReason}</span>
                  ) : null}
                </label>
                <label>
                  Comments for contractor
                  <textarea
                    rows={3}
                    value={rejectComments}
                    aria-invalid={Boolean(fieldErrors.rejectComments)}
                    onChange={(e) => {
                      setRejectComments(e.target.value);
                      if (fieldErrors.rejectComments) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.rejectComments;
                          return next;
                        });
                      }
                    }}
                    placeholder="Visible to contractor on next visit"
                  />
                  {fieldErrors.rejectComments ? (
                    <span className="field-error">{fieldErrors.rejectComments}</span>
                  ) : null}
                </label>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const errors = v.collect({
                      rejectReason: v.minLength(rejectReason, 3, "Rejection reason"),
                      rejectComments: v.minLength(rejectComments, 5, "Comments"),
                    });
                    if (Object.keys(errors).length) {
                      setFieldErrors(errors);
                      setError(v.firstError(errors));
                      return;
                    }
                    setFieldErrors({});
                    setError(null);
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
                  <input
                    value={deadlineDays}
                    inputMode="numeric"
                    aria-invalid={Boolean(fieldErrors.deadlineDays)}
                    onChange={(e) => {
                      setDeadlineDays(e.target.value);
                      if (fieldErrors.deadlineDays) {
                        setFieldErrors((prev) => {
                          const next = { ...prev };
                          delete next.deadlineDays;
                          return next;
                        });
                      }
                    }}
                  />
                  {fieldErrors.deadlineDays ? (
                    <span className="field-error">{fieldErrors.deadlineDays}</span>
                  ) : (
                    <span className="field-hint">1–365 days</span>
                  )}
                </label>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!token) return;
                    const deadlineErr = v.integerInRange(deadlineDays, 1, 365, "Deadline");
                    if (deadlineErr) {
                      setFieldErrors({ deadlineDays: deadlineErr });
                      setError(deadlineErr);
                      return;
                    }
                    setFieldErrors({});
                    setBusy(true);
                    setError(null);
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
              <p className="muted">NHIPMPL representative account is view-only.</p>
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
