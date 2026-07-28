import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { StatusBadge } from "../components/StatusBadge";
import type { Issue, IssueStatus } from "../types";
import { IssueDetailPanel } from "../components/IssueDetailPanel";

const TABS: { key: "all" | IssueStatus; label: string }[] = [
  { key: "all", label: "All Issues" },
  { key: "open", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "verification_pending", label: "Verification Pending" },
  { key: "under_review", label: "Under Review / Rework" },
  { key: "closed", label: "Closed" },
];

export function IssuesPage() {
  const { token, role, isReadonly } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as IssueStatus | null) || null;
  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const action = params.get("action");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
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

  const openIssue = (id: number, nextAction?: string) => {
    const next = new URLSearchParams(params);
    next.set("id", String(id));
    if (nextAction) next.set("action", nextAction);
    else next.delete("action");
    setParams(next);
  };

  const startWork = async (issue: Issue, e: MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    setBusyId(issue.id);
    setError(null);
    try {
      if (issue.status === "under_review") await api.reworkStart(token, issue.id);
      else await api.startIssue(token, issue.id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const selected = issues.find((i) => i.id === selectedId) || null;
  const showContractorActions = !isReadonly && role === "contractor";

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
              {showContractorActions ? <th>Quick action</th> : null}
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr
                key={i.id}
                className="clickable"
                onClick={() => openIssue(i.id)}
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
                {showContractorActions ? (
                  <td onClick={(e) => e.stopPropagation()}>
                    {i.status === "open" || i.status === "under_review" ? (
                      <button
                        className="btn"
                        type="button"
                        disabled={busyId === i.id}
                        onClick={(e) => startWork(i, e)}
                      >
                        {i.status === "under_review" ? "Start rework" : "Start work"}
                      </button>
                    ) : null}
                    {i.status === "in_progress" ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => openIssue(i.id, "submit")}
                      >
                        Submit
                      </button>
                    ) : null}
                    {i.status === "under_review" ? (
                      <button
                        className="btn ghost"
                        type="button"
                        style={{ marginLeft: 6 }}
                        onClick={() => openIssue(i.id, "rejection")}
                      >
                        View comments
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
            {!issues.length ? (
              <tr>
                <td colSpan={showContractorActions ? 10 : 9}>No issues found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {selectedId ? (
        <IssueDetailPanel
          issueId={selectedId}
          fallback={selected}
          focusAction={action}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete("id");
            next.delete("action");
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
