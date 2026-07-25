import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import type { Issue, IssueStatus } from "../types";
import { IssueDetailPanel } from "../components/IssueDetailPanel";

const TABS: { key: "all" | IssueStatus; label: string }[] = [
  { key: "all", label: "All Issues" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "verification_pending", label: "Verification Pending" },
  { key: "under_review", label: "Under Review" },
  { key: "closed", label: "Closed" },
];

export function IssuesPage() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as IssueStatus | null) || null;
  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    if (!token) return;
    api
      .issues(token, status)
      .then(setIssues)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, [token, status]);

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Issues";
  }, []);

  const selected = issues.find((i) => i.id === selectedId) || null;

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`pill ${(!status && t.key === "all") || status === t.key ? "active" : ""}`}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (t.key === "all") next.delete("status");
              else next.set("status", t.key);
              setParams(next);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>Work Category</th>
              <th>Issue Type</th>
              <th>Chainage</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Reporter</th>
              <th>Assignee</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr
                key={i.id}
                className="clickable"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("id", String(i.id));
                  setParams(next);
                }}
              >
                <td>#{i.id}</td>
                <td>{i.work_category_label || i.work_category}</td>
                <td>
                  <strong>{i.issue_type}</strong>
                  {i.issue_type_label ? ` · ${i.issue_type_label}` : ""}
                </td>
                <td>{i.chainage || "—"}</td>
                <td>{i.priority}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td>{i.reported_by_id}</td>
                <td>{i.assigned_contractor_id}</td>
                <td>{i.created_at.slice(0, 10)}</td>
              </tr>
            ))}
            {!issues.length ? (
              <tr>
                <td colSpan={9}>No issues found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {selectedId ? (
        <IssueDetailPanel
          issueId={selectedId}
          fallback={selected}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("id");
            setParams(next);
          }}
          onChanged={() => {
            load();
            navigate(`/issues?${params.toString()}`);
          }}
        />
      ) : null}
    </>
  );
}
