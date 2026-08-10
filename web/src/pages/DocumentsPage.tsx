import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { formatLabel } from "../components/StatusBadge";
import type { DocumentFolder, PortalDocument } from "../types";

function findFolder(nodes: DocumentFolder[], id: number | null): DocumentFolder | null {
  if (id == null) return null;
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findFolder(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

function FolderTree({
  nodes,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  depth = 0,
}: {
  nodes: DocumentFolder[];
  selectedId: number | null;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onSelect: (f: DocumentFolder) => void;
  depth?: number;
}) {
  return (
    <ul className="folder-tree" style={{ paddingLeft: depth ? 14 : 0 }}>
      {nodes.map((f) => {
        const hasKids = (f.children || []).length > 0;
        const open = expanded.has(f.id);
        const icon =
          f.folder_type === "stretch" ? "📁" : f.folder_type === "discipline" ? "📂" : "📄";
        return (
          <li key={f.id}>
            <button
              type="button"
              className={`folder-item${selectedId === f.id ? " active" : ""}`}
              onClick={() => {
                onSelect(f);
                if (hasKids) onToggle(f.id);
              }}
            >
              {hasKids ? (
                <span className="folder-caret">{open ? "▾" : "▸"}</span>
              ) : (
                <span className="folder-caret spacer" />
              )}
              <span className="folder-icon">{icon}</span>
              <span className="folder-name">{f.name}</span>
              {f.folder_type === "doctype" ? (
                <span className="folder-count">{f.document_count || 0}</span>
              ) : null}
            </button>
            {hasKids && open ? (
              <FolderTree
                nodes={f.children}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DocumentsPage() {
  const { token, role, isReadonly } = useAuth();
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selected, setSelected] = useState<PortalDocument | null>(null);
  const [versions, setVersions] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ title: "", description: "" });
  const [uploadMode, setUploadMode] = useState<"file" | "folder">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [signText, setSignText] = useState("");
  const [watermark, setWatermark] = useState("");

  const selectedFolder = useMemo(
    () => findFolder(folders, selectedFolderId),
    [folders, selectedFolderId]
  );
  const canUploadHere = selectedFolder?.folder_type === "doctype";

  const breadcrumb = useMemo(() => {
    if (!selectedFolder) return [] as string[];
    const path: string[] = [];
    const walk = (nodes: DocumentFolder[], target: number, trail: string[]): boolean => {
      for (const n of nodes) {
        const next = [...trail, n.name];
        if (n.id === target) {
          path.push(...next);
          return true;
        }
        if (walk(n.children || [], target, next)) return true;
      }
      return false;
    };
    walk(folders, selectedFolder.id, []);
    return path;
  }, [folders, selectedFolder]);

  const loadFolders = async () => {
    if (!token) return;
    const tree = await api.documentFolders(token);
    setFolders(tree);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const s of tree) next.add(s.id);
      return next;
    });
  };

  const loadDocs = async (folderId: number | null) => {
    if (!token || folderId == null) {
      setDocs([]);
      return;
    }
    const d = await api.documents(token, undefined, folderId);
    setDocs(d);
    if (selected) setSelected(d.find((x) => x.id === selected.id) || null);
  };

  const load = async () => {
    if (!token) return;
    try {
      await loadFolders();
      await loadDocs(selectedFolderId);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Documents & Approvals";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  useEffect(() => {
    loadDocs(selectedFolderId).catch((e: Error) => setError(e.message));
  }, [selectedFolderId, token]);

  const openDoc = async (d: PortalDocument) => {
    if (!token) return;
    setSelected(d);
    setWatermark(d.watermark_text || "");
    try {
      const v = await api.nhitGet<Record<string, unknown>[]>(token, `/documents/${d.id}/versions`);
      setVersions(v);
    } catch {
      setVersions([]);
    }
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly || !files.length || !canUploadHere || !selectedFolder) {
      return setError("Open a document-type folder (Contract / Drawing / EOT) and choose a file or folder");
    }
    setBusy(true);
    setError(null);
    try {
      let uploaded = 0;
      for (const file of files) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const title =
          files.length === 1 && form.title.trim()
            ? form.title.trim()
            : rel.replace(/\\/g, "/").split("/").pop() || file.name;
        const descParts = [
          form.description.trim(),
          uploadMode === "folder" && rel.includes("/") ? `Folder path: ${rel}` : "",
        ].filter(Boolean);
        const fd = new FormData();
        fd.append("title", title);
        fd.append("category", selectedFolder.name);
        fd.append("folder_id", String(selectedFolder.id));
        if (selectedFolder.project_id) fd.append("project_id", String(selectedFolder.project_id));
        if (descParts.length) fd.append("description", descParts.join("\n"));
        fd.append("file", file);
        await api.uploadDocument(token, fd);
        uploaded += 1;
      }
      setForm({ title: "", description: "" });
      setFiles([]);
      await load();
      await loadDocs(selectedFolder.id);
      if (uploaded > 1) setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      if (selected) await openDoc(selected);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <div className="docs-layout">
        <aside className="panel docs-sidebar">
          <div className="panel-head-row">
            <h2>Folders</h2>
            {role === "admin" ? (
              <button
                className="btn ghost"
                type="button"
                onClick={async () => {
                  if (!token) return;
                  await api.seedDocumentFolders(token);
                  await load();
                }}
              >
                Setup folders
              </button>
            ) : null}
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Stretch → Civil / Toll-ATMS-TMS → Contract / Drawing / EOT
          </p>
          {folders.length ? (
            <FolderTree
              nodes={folders}
              selectedId={selectedFolderId}
              expanded={expanded}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onSelect={(f) => setSelectedFolderId(f.id)}
            />
          ) : (
            <p className="muted">No folders yet. Admin can click Setup folders.</p>
          )}
        </aside>

        <div className="docs-main">
          <section className="panel">
            <div className="panel-head-row">
              <div>
                <h2>Repository</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {breadcrumb.length ? breadcrumb.join(" / ") : "Select a folder on the left"}
                </p>
              </div>
            </div>

            {canUploadHere && !isReadonly ? (
              <form className="form-grid" onSubmit={onUpload} style={{ marginBottom: "1rem" }}>
                <label>
                  Upload type
                  <select
                    value={uploadMode}
                    onChange={(e) => {
                      setUploadMode(e.target.value as "file" | "folder");
                      setFiles([]);
                    }}
                  >
                    <option value="file">Single / multiple files</option>
                    <option value="folder">Entire folder</option>
                  </select>
                </label>
                <label>
                  {uploadMode === "folder" ? "Folder" : "File(s)"}
                  {uploadMode === "folder" ? (
                    <input
                      key="folder-input"
                      type="file"
                      required
                      multiple
                      ref={(el) => {
                        if (!el) return;
                        el.setAttribute("webkitdirectory", "");
                        el.setAttribute("directory", "");
                      }}
                      onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    />
                  ) : (
                    <input
                      key="file-input"
                      type="file"
                      required
                      multiple
                      onChange={(e) => setFiles(Array.from(e.target.files || []))}
                    />
                  )}
                </label>
                {uploadMode === "file" ? (
                  <label>
                    Title
                    <input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Optional — defaults to file name"
                    />
                  </label>
                ) : (
                  <label>
                    Selected
                    <input
                      readOnly
                      value={
                        files.length
                          ? `${files.length} file(s) from folder`
                          : "Choose a folder to upload all files inside"
                      }
                    />
                  </label>
                )}
                <label className="span-2">
                  Description
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder={
                      uploadMode === "folder"
                        ? "Optional note applied to each uploaded file"
                        : undefined
                    }
                  />
                </label>
                {files.length > 0 ? (
                  <p className="muted span-2" style={{ margin: 0 }}>
                    Ready to upload {files.length} file{files.length === 1 ? "" : "s"} into this folder
                    {uploadMode === "folder" && files[0]
                      ? ` (${((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "").split("/")[0] || "selected folder"})`
                      : ""}
                    .
                  </p>
                ) : null}
                <div className="span-2">
                  <button className="btn" type="submit" disabled={busy || !files.length}>
                    {busy
                      ? "Uploading…"
                      : uploadMode === "folder"
                        ? `Upload folder (${files.length || 0})`
                        : `Upload into this folder${files.length > 1 ? ` (${files.length})` : ""}`}
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">
                {selectedFolder
                  ? "Open a leaf folder (Contract agreement / Drawing / Extension time) to upload files or a folder."
                  : "Browse the three stretch folders on the left."}
              </p>
            )}

            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Ver</th>
                  <th>Status</th>
                  <th>Class</th>
                  <th>Checkout</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.title}
                      <div className="muted">{d.category}</div>
                    </td>
                    <td>v{d.current_version ?? 1}</td>
                    <td>
                      <span className={`badge status-${d.approval_status || "draft"}`}>
                        {formatLabel(d.approval_status || "draft")}
                      </span>
                    </td>
                    <td>{d.classification || "internal"}</td>
                    <td>{d.checked_out_by_id ? `User #${d.checked_out_by_id}` : "—"}</td>
                    <td>
                      <button type="button" className="linkish" onClick={() => openDoc(d)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {!docs.length ? (
                  <tr>
                    <td colSpan={6}>
                      {canUploadHere ? "No documents in this folder yet." : "Select a document-type folder."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          {selected ? (
            <section className="panel">
              <div className="panel-head-row">
                <h2>
                  {selected.title} (v{selected.current_version ?? 1})
                </h2>
                <button type="button" className="linkish" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <div className="btn-row">
                <a
                  className="btn secondary"
                  href={mediaUrl(selected.file_path)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => token && api.nhitPost(token, `/documents/${selected.id}/log-download`, {})}
                >
                  Open / download
                </a>
                {!isReadonly ? (
                  <>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => api.nhitPost(token!, `/documents/${selected.id}/checkout`, {}))}
                    >
                      Check-out
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => api.nhitPost(token!, `/documents/${selected.id}/checkin`, {}))}
                    >
                      Check-in
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api.nhitPost(token!, `/documents/${selected.id}/request-approval`, {
                            note: "Please approve",
                            signature_data: signText || undefined,
                          })
                        )
                      }
                    >
                      Request approval
                    </button>
                    {(role === "admin" || role === "government") && (
                      <>
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api.nhitPost(token!, `/documents/${selected.id}/decide-approval?approve=true`, {
                                note: "Approved",
                                signature_data: signText || "Digitally signed",
                              })
                            )
                          }
                        >
                          Approve + sign
                        </button>
                        <button
                          className="btn danger"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api.nhitPost(token!, `/documents/${selected.id}/decide-approval?approve=false`, {
                                note: "Rejected",
                              })
                            )
                          }
                        >
                          Reject
                        </button>
                        <button
                          className="btn secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api.nhitPatch(token!, `/documents/${selected.id}/meta`, {
                                watermark_text: watermark || "CONFIDENTIAL — RoadService",
                                classification: "confidential",
                              })
                            )
                          }
                        >
                          Set watermark
                        </button>
                      </>
                    )}
                  </>
                ) : null}
              </div>
              <div className="form-grid" style={{ marginTop: "1rem" }}>
                <label>
                  Digital signature text
                  <input value={signText} onChange={(e) => setSignText(e.target.value)} />
                </label>
                <label>
                  Watermark text
                  <input value={watermark} onChange={(e) => setWatermark(e.target.value)} />
                </label>
                {!isReadonly ? (
                  <label className="span-2">
                    Upload new version
                    <input type="file" onChange={(e) => setVersionFile(e.target.files?.[0] || null)} />
                  </label>
                ) : null}
              </div>
              {versionFile && token ? (
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    const fd = new FormData();
                    fd.append("file", versionFile);
                    fd.append("change_note", "Updated version");
                    act(async () => {
                      await api.nhitForm(token, `/documents/${selected.id}/new-version`, fd);
                      setVersionFile(null);
                    });
                  }}
                >
                  Save new version
                </button>
              ) : null}
              <h3 style={{ marginTop: "1rem" }}>Version history</h3>
              <ul className="activity-list">
                {versions.map((v) => (
                  <li key={String(v.id)}>
                    v{String(v.version_no)} — {String(v.change_note || "update")}{" "}
                    <span className="muted">{String(v.created_at)}</span>
                  </li>
                ))}
                {!versions.length ? <li className="muted">No versions listed yet.</li> : null}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
