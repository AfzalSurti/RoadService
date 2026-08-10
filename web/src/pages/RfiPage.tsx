import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";
import type { Issue, Project, SiteRfi } from "../types";

const empty = {
  project_id: "",
  subject: "",
  description: "",
  chainage: "",
  priority: "medium",
  related_issue_id: "",
};

export function RfiPage() {
  const { token, role, isReadonly } = useAuth();
  const [rows, setRows] = useState<SiteRfi[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<SiteRfi | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [form, setForm] = useState(empty);
  const [answer, setAnswer] = useState("");

  const canRaise =
    !isReadonly && (role === "contractor" || role === "admin" || role === "surveyor");
  const canAnswer = role === "admin" || role === "government" || role === "surveyor";

  const load = async () => {
    if (!token) return;
    try {
      const [list, proj, iss] = await Promise.all([
        api.rfis(token, filter || undefined),
        api.projects(token),
        api.issues(token).catch(() => [] as Issue[]),
      ]);
      setRows(list);
      setProjects(proj);
      setIssues(iss);
      setError(null);
      if (selected) {
        const fresh = list.find((r) => r.id === selected.id) || null;
        setSelected(fresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load RFIs");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "RFI — Site Request for Information";
  }, []);

  useEffect(() => {
    void load();
  }, [token, filter]);

  const onRaise = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canRaise) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const created = await api.raiseRfi(token, {
        project_id: Number(form.project_id),
        subject: form.subject.trim(),
        description: form.description.trim(),
        chainage: form.chainage.trim() || undefined,
        priority: form.priority,
        related_issue_id: form.related_issue_id ? Number(form.related_issue_id) : undefined,
      });
      setShowRaise(false);
      setForm(empty);
      setMsg(`RFI ${created.rfi_no} raised`);
      setSelected(created);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Raise failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <div>
            <h2>RFI (Request for Information)</h2>
            <p className="muted" style={{ margin: 0 }}>
              Site clarification requests. Contractor raises RFI; GMC / NHIPMPL answer. Linked to
              site defects/issues when needed. Mobile contractor app has the same module.
            </p>
          </div>
          {canRaise ? (
            <button className="btn" type="button" onClick={() => setShowRaise(true)}>
              Raise new RFI
            </button>
          ) : null}
        </div>
        <label style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </section>

      <div className="docs-layout">
        <section className="panel">
          <table className="data">
            <thead>
              <tr>
                <th>RFI No</th>
                <th>Project</th>
                <th>Subject</th>
                <th>Priority</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.rfi_no}</td>
                  <td>{projects.find((p) => p.id === r.project_id)?.name || `#${r.project_id}`}</td>
                  <td>{r.subject}</td>
                  <td>{formatLabel(r.priority)}</td>
                  <td>{formatLabel(r.status)}</td>
                  <td>
                    <button className="btn ghost" type="button" onClick={() => setSelected(r)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No RFIs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <aside className="panel docs-sidebar">
          <h2>Details</h2>
          {!selected ? (
            <p className="muted">Select an RFI.</p>
          ) : (
            <>
              <p>
                <strong>{selected.rfi_no}</strong> · {formatLabel(selected.status)}
              </p>
              <p className="muted">
                {projects.find((p) => p.id === selected.project_id)?.name || `Project #${selected.project_id}`}
                {selected.chainage ? ` · Ch. ${selected.chainage}` : ""}
              </p>
              <h3 style={{ fontSize: "0.95rem" }}>{selected.subject}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
              {selected.related_issue_id ? (
                <p>
                  Related defect/issue:{" "}
                  <Link to="/issues">{`#${selected.related_issue_id}`}</Link>
                </p>
              ) : null}
              {selected.answer_text ? (
                <p>
                  <strong>Answer:</strong> {selected.answer_text}
                </p>
              ) : null}

              {canAnswer && selected.can_answer ? (
                <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <label>
                    Answer *
                    <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || answer.trim().length < 3}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const updated = await api.answerRfi(token, selected.id, {
                          answer_text: answer.trim(),
                        });
                        setSelected(updated);
                        setAnswer("");
                        setMsg(`${updated.rfi_no} answered`);
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Answer failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Submit answer
                  </button>
                </div>
              ) : null}

              {selected.can_close && !isReadonly ? (
                <button
                  className="btn secondary"
                  type="button"
                  style={{ marginTop: "0.75rem" }}
                  disabled={busy}
                  onClick={async () => {
                    if (!token) return;
                    setBusy(true);
                    try {
                      const updated = await api.closeRfi(token, selected.id);
                      setSelected(updated);
                      setMsg(`${updated.rfi_no} closed`);
                      await load();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Close failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Close RFI
                </button>
              ) : null}
            </>
          )}
        </aside>
      </div>

      {showRaise ? (
        <div className="modal-backdrop" onClick={() => setShowRaise(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onRaise}>
            <h2>Raise new RFI</h2>
            <div className="form-grid">
              <label className="span-2">
                Project *
                <select
                  required
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value, related_issue_id: "" })}
                >
                  <option value="">Select</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label>
                Chainage
                <input
                  value={form.chainage}
                  onChange={(e) => setForm({ ...form, chainage: e.target.value })}
                  placeholder="e.g. 12+500"
                />
              </label>
              <label className="span-2">
                Related site defect / issue (optional)
                <select
                  value={form.related_issue_id}
                  onChange={(e) => setForm({ ...form, related_issue_id: e.target.value })}
                >
                  <option value="">None</option>
                  {issues
                    .filter((i) => !form.project_id || String(i.project_id) === form.project_id)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.id} · {i.issue_type} · {i.status}
                      </option>
                    ))}
                </select>
              </label>
              <label className="span-2">
                Subject *
                <input
                  required
                  minLength={3}
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </label>
              <label className="span-2">
                Description / clarification needed *
                <textarea
                  required
                  minLength={5}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit RFI"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowRaise(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
