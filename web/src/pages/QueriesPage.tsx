import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { ProjectSelect } from "../components/ProjectSelect";
import { formatLabel } from "../components/StatusBadge";
import { projectIdFromUrl } from "../lib/projectScope";
import type { PortalQueryTicket, Project } from "../types";

const empty = {
  subject: "",
  description: "",
  module_area: "billing",
  priority: "medium",
  project_id: "",
};

export function QueriesPage() {
  const { token, role, isReadonly } = useAuth();
  const [searchParams] = useSearchParams();
  const projectId = projectIdFromUrl(searchParams.get("project"));
  const [tickets, setTickets] = useState<PortalQueryTicket[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<PortalQueryTicket | null>(null);
  const [metaAreas, setMetaAreas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaise, setShowRaise] = useState(false);
  const [form, setForm] = useState(empty);
  const [filterStatus, setFilterStatus] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [comment, setComment] = useState("");
  const [shotFiles, setShotFiles] = useState<File[]>([]);

  const canResolve = role === "admin" || role === "government";
  const canRaise = !isReadonly && (role === "admin" || role === "government" || role === "contractor");

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of tickets) {
      if (t.status in c) c[t.status as keyof typeof c] += 1;
    }
    return c;
  }, [tickets]);

  const load = async () => {
    if (!token) return;
    try {
      const [list, proj, meta] = await Promise.all([
        api.queries(token, filterStatus || undefined, undefined, projectId),
        api.projects(token),
        api.queryMeta(token),
      ]);
      setTickets(list);
      setProjects(proj);
      setMetaAreas(meta.module_areas || []);
      if (projectId && !form.project_id) {
        setForm((f) => ({ ...f, project_id: String(projectId) }));
      }
      setError(null);
      if (selected) {
        const fresh = await api.getQuery(token, selected.id).catch(() => null);
        if (fresh) setSelected(fresh);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load queries");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = projectId ? `Query Raise · Project #${projectId}` : "Query Raise";
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [token, filterStatus, projectId]);

  const openTicket = async (id: number) => {
    if (!token) return;
    try {
      const t = await api.getQuery(token, id);
      setSelected(t);
      setResolveNote("");
      setComment("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open ticket");
    }
  };

  const onRaise = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canRaise) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (!shotFiles.length) {
        setError("Upload at least 1 image / screenshot (max 4)");
        setBusy(false);
        return;
      }
      if (shotFiles.length > 4) {
        setError("Maximum 4 images allowed");
        setBusy(false);
        return;
      }
      const fd = new FormData();
      fd.append("subject", form.subject.trim());
      fd.append("description", form.description.trim());
      fd.append("module_area", form.module_area);
      fd.append("priority", form.priority);
      if (form.project_id) fd.append("project_id", form.project_id);
      for (const file of shotFiles) {
        fd.append("attachments", file);
      }
      const created = await api.raiseQuery(token, fd);
      setShowRaise(false);
      setForm(empty);
      setShotFiles([]);
      setMsg(`Ticket ${created.ticket_no} raised`);
      await load();
      setSelected(created);
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
            <h2>Query Raise (Tickets)</h2>
            <p className="muted" style={{ margin: 0 }}>
              Raise portal-operations queries (billing, documents, toll, ITS, etc.). GMC / NHIPMPL
              take up and resolve; raiser can reopen with a note if needed.
            </p>
          </div>
          {canRaise ? (
            <button className="btn" type="button" onClick={() => setShowRaise(true)}>
              Raise query / ticket
            </button>
          ) : null}
        </div>

        <div className="billing-status-grid" style={{ marginTop: "1rem" }}>
          {(
            [
              ["open", "Open", counts.open],
              ["in_progress", "In progress", counts.in_progress],
              ["resolved", "Resolved", counts.resolved],
              ["closed", "Closed", counts.closed],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              className="billing-status-card"
              style={{ background: filterStatus === key ? "var(--accent)" : "#334155" }}
              onClick={() => setFilterStatus(filterStatus === key ? "" : key)}
            >
              <div>{label}</div>
              <strong>{n}</strong>
            </button>
          ))}
        </div>
      </section>

      <div className="docs-layout">
        <section className="panel">
          <h2>Tickets</h2>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Module</th>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className={selected?.id === t.id ? "active-row" : undefined}>
                    <td>{t.ticket_no}</td>
                    <td>{formatLabel(t.module_area)}</td>
                    <td>{t.subject}</td>
                    <td>{formatLabel(t.priority)}</td>
                    <td>{formatLabel(t.status)}</td>
                    <td>
                      <button className="btn ghost" type="button" onClick={() => void openTicket(t.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {!tickets.length ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No queries yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel docs-sidebar">
          <h2>Resolve process</h2>
          {!selected ? (
            <p className="muted">Select a ticket to view details and resolve.</p>
          ) : (
            <>
              <p>
                <strong>{selected.ticket_no}</strong> · {formatLabel(selected.status)} ·{" "}
                {formatLabel(selected.priority)}
              </p>
              <p className="muted">
                Module: {formatLabel(selected.module_area)}
                {selected.project_id
                  ? ` · Project: ${projects.find((p) => p.id === selected.project_id)?.name || `#${selected.project_id}`}`
                  : ""}
              </p>
              <h3 style={{ fontSize: "0.95rem" }}>{selected.subject}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{selected.description}</p>
              {(selected.attachment_paths?.length || selected.attachment_path) ? (
                <div style={{ marginBottom: "0.75rem" }}>
                  <strong>Attached screenshots</strong>
                  <div className="query-shot-grid">
                    {(selected.attachment_paths?.length
                      ? selected.attachment_paths
                      : selected.attachment_path
                        ? [selected.attachment_path]
                        : []
                    ).map((path) => (
                      <a key={path} href={mediaUrl(path)} target="_blank" rel="noreferrer">
                        <img src={mediaUrl(path)} alt="Query screenshot" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {selected.resolution_note ? (
                <p>
                  <strong>Resolution:</strong> {selected.resolution_note}
                </p>
              ) : null}

              <h3 style={{ fontSize: "0.95rem" }}>Activity</h3>
              <ul className="folder-tree" style={{ marginBottom: "1rem" }}>
                {(selected.comments || []).map((c) => (
                  <li key={c.id} style={{ marginBottom: "0.4rem", fontSize: "0.85rem" }}>
                    <strong>{formatLabel(c.action)}</strong> · {new Date(c.created_at).toLocaleString()}
                    <div>{c.note}</div>
                  </li>
                ))}
                {!selected.comments?.length ? <li className="muted">No activity yet.</li> : null}
              </ul>

              {canResolve && (selected.status === "open" || selected.status === "in_progress") ? (
                <div style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
                  {selected.status === "open" ? (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!token) return;
                        setBusy(true);
                        try {
                          const t = await api.startQuery(token, selected.id);
                          setSelected(t);
                          setMsg(`${t.ticket_no} marked in progress`);
                          await load();
                        } catch (err: unknown) {
                          setError(err instanceof Error ? err.message : "Start failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Take up (In progress)
                    </button>
                  ) : null}
                  <label>
                    Resolution note *
                    <textarea
                      value={resolveNote}
                      onChange={(e) => setResolveNote(e.target.value)}
                      placeholder="How the query was resolved"
                    />
                  </label>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy || resolveNote.trim().length < 3}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const t = await api.resolveQuery(token, selected.id, {
                          resolution_note: resolveNote.trim(),
                          status: "resolved",
                        });
                        setSelected(t);
                        setMsg(`${t.ticket_no} resolved`);
                        setResolveNote("");
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Resolve failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Resolve query
                  </button>
                </div>
              ) : null}

              {(selected.status === "resolved" || selected.status === "closed") && canRaise ? (
                <div style={{ marginBottom: "1rem" }}>
                  <label>
                    Reopen reason
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
                  </label>
                  <button
                    className="btn secondary"
                    type="button"
                    style={{ marginTop: "0.5rem" }}
                    disabled={busy || comment.trim().length < 2}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const t = await api.reopenQuery(token, selected.id, { note: comment.trim() });
                        setSelected(t);
                        setComment("");
                        setMsg(`${t.ticket_no} reopened`);
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Reopen failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Reopen query
                  </button>
                </div>
              ) : null}

              {canRaise ? (
                <div>
                  <label>
                    Add comment
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
                  </label>
                  <button
                    className="btn ghost"
                    type="button"
                    style={{ marginTop: "0.5rem" }}
                    disabled={busy || !comment.trim()}
                    onClick={async () => {
                      if (!token) return;
                      setBusy(true);
                      try {
                        const t = await api.commentQuery(token, selected.id, { note: comment.trim() });
                        setSelected(t);
                        setComment("");
                        await load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Comment failed");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Post comment
                  </button>
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>

      {showRaise ? (
        <div className="modal-backdrop" onClick={() => setShowRaise(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onRaise}>
            <h2>Raise query / ticket</h2>
            <div className="form-grid">
              <label>
                Portal module *
                <select
                  value={form.module_area}
                  onChange={(e) => setForm({ ...form, module_area: e.target.value })}
                >
                  {(metaAreas.length ? metaAreas : ["billing", "documents", "other"]).map((a) => (
                    <option key={a} value={a}>
                      {formatLabel(a)}
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
              <ProjectSelect
                className="span-2"
                label="Project (optional)"
                allowAll
                allLabel="None / all projects"
                value={form.project_id}
                onChange={(id) => setForm({ ...form, project_id: id })}
              />
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
                Description *
                <textarea
                  required
                  minLength={5}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <label className="span-2">
                Images / screenshots * (max 4)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  required
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    if (picked.length > 4) {
                      setError("Maximum 4 images allowed");
                      setShotFiles(picked.slice(0, 4));
                      e.target.value = "";
                      return;
                    }
                    setError(null);
                    setShotFiles(picked);
                  }}
                />
                <small className="muted">
                  {shotFiles.length
                    ? `${shotFiles.length} selected: ${shotFiles.map((f) => f.name).join(", ")}`
                    : "Choose up to 4 image files"}
                </small>
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit ticket"}
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
