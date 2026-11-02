import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { getSelectedProjectId, projectShortName, setSelectedProjectId, usePackageScope } from "../lib/projectScope";
import { InventorySheets } from "../components/InventorySheets";
import type { InventoryItem, Project } from "../types";

type Row = { scope: string; description: string };

/**
 * Project Inventory: per package, the "Project Location" scope table
 * (Sr. No / Scope / Description) with an optional photo beside it.
 * GMC Experts edit the table and add / change / remove the photo; others view.
 */
export function ProjectInventoryPage() {
  const { token, role, isReadonly } = useAuth();
  const canManage = role === "admin" && !isReadonly;
  const [params, setParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Sidebar package scope: tabs only for the chosen packages.
  const { inScope } = usePackageScope();
  const sorted = useMemo(
    () => projects.filter((p) => inScope(p.id)).sort((a, b) => a.id - b.id),
    [projects, inScope]
  );
  const urlId = Number(params.get("project") || 0) || null;
  const preferred = urlId || getSelectedProjectId();
  const pid = (preferred && sorted.some((p) => p.id === preferred) ? preferred : null) || sorted[0]?.id || null;
  const project = sorted.find((p) => p.id === pid) || sorted[0] || null;

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = project ? `Project Inventory · ${projectShortName(project)}` : "Project Inventory";
  }, [project]);

  useEffect(() => {
    if (!token) return;
    api
      .projects(token)
      .then(setProjects)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!token || !project) return;
    setItems(null);
    setDraft(null);
    api
      .projectInventory(token, project.id)
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [token, project?.id]);

  const pick = (p: Project) => {
    setSelectedProjectId(p.id);
    setParams({ project: String(p.id) });
    setMsg(null);
  };

  const startEdit = () => {
    setDraft((items || []).map((i) => ({ scope: i.scope, description: i.description })));
    setMsg(null);
  };
  const setRow = (idx: number, patch: Partial<Row>) =>
    setDraft((d) => (d ? d.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : d));
  const move = (idx: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const next = [...d];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return d;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const save = async () => {
    if (!token || !project || !draft) return;
    setBusy(true);
    try {
      const saved = await api.saveProjectInventory(token, project.id, draft);
      setItems(saved);
      setDraft(null);
      setMsg("Project inventory saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!token || !project || !file) return;
    setBusy(true);
    try {
      const updated = await api.uploadLocationMap(token, project.id, file);
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      setMsg("Photo saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!token || !project || !window.confirm("Remove this photo?")) return;
    setBusy(true);
    try {
      const updated = await api.removeLocationMap(token, project.id);
      setProjects((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      setMsg("Photo removed.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  const photoPicker = (label: string) => (
    <label className="btn ghost inventory-photo-pick">
      {busy ? "Saving…" : label}
      <input
        type="file"
        accept="image/*"
        hidden
        disabled={busy}
        onChange={(e) => {
          void uploadPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      <div className="works-tabs inventory-tabs">
        {sorted.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`works-tab${project?.id === p.id ? " active" : ""}`}
            onClick={() => pick(p)}
          >
            <span className="works-tab-no">{i + 1}</span>
            <span className="works-tab-label">{projectShortName(p)}</span>
          </button>
        ))}
      </div>

      {project ? (
        <section className="panel">
          <div className="panel-head-row">
            <h2>Project Location ({projectShortName(project)})</h2>
            {canManage ? (
              <div className="btn-row">
                {!project.location_map_url ? photoPicker("+ Add photo") : null}
                {!draft ? (
                  <button type="button" className="btn" onClick={startEdit} disabled={!items}>
                    Edit table
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={`inventory-layout${project.location_map_url ? " has-photo" : ""}`}>
            {project.location_map_url ? (
              <figure className="inventory-photo">
                <a href={mediaUrl(project.location_map_url)} target="_blank" rel="noreferrer">
                  <img src={mediaUrl(project.location_map_url)} alt={`Project Location · ${projectShortName(project)}`} />
                </a>
                {canManage ? (
                  <div className="btn-row">
                    {photoPicker("Change photo")}
                    <button type="button" className="btn ghost danger" onClick={removePhoto} disabled={busy}>
                      Remove photo
                    </button>
                  </div>
                ) : null}
              </figure>
            ) : null}

            <div className="table-scroll">
              {!items ? (
                <p className="muted">Loading…</p>
              ) : draft ? (
                <>
                  <table className="data inventory-table">
                    <thead>
                      <tr>
                        <th>Sr. No</th>
                        <th>Scope</th>
                        <th>Description</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.map((r, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>
                            <input value={r.scope} onChange={(e) => setRow(i, { scope: e.target.value })} />
                          </td>
                          <td>
                            <textarea
                              rows={Math.min(5, Math.max(1, r.description.split("\n").length))}
                              value={r.description}
                              onChange={(e) => setRow(i, { description: e.target.value })}
                            />
                          </td>
                          <td className="inventory-row-actions">
                            <button type="button" className="linkish" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                              ↑
                            </button>
                            <button
                              type="button"
                              className="linkish"
                              onClick={() => move(i, 1)}
                              disabled={i === draft.length - 1}
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="linkish vendor-docs-remove"
                              onClick={() => setDraft((d) => (d ? d.filter((_, j) => j !== i) : d))}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="btn-row" style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setDraft((d) => [...(d || []), { scope: "", description: "" }])}
                    >
                      + Add row
                    </button>
                    <button type="button" className="btn" onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save table"}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setDraft(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : items.length ? (
                <table className="data inventory-table">
                  <thead>
                    <tr>
                      <th>Sr. No</th>
                      <th>Scope</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, i) => (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>{r.scope}</td>
                        <td className="inventory-desc">{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">
                  No inventory rows yet{canManage ? " — click Edit table to add them." : "."}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <p className="muted">No projects yet.</p>
      )}

      {project ? <InventorySheets key={project.id} projectId={project.id} /> : null}
    </>
  );
}
