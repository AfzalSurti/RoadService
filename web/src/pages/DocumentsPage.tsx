import { FormEvent, useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import type { PortalDocument, Project } from "../types";

const CATEGORIES = ["contract", "project", "financial", "its", "statutory", "other"];

export function DocumentsPage() {
  const { token, isReadonly } = useAuth();
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterProject, setFilterProject] = useState<number | "">("");
  const [form, setForm] = useState({
    title: "",
    category: "project",
    description: "",
    project_id: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    if (!token) return;
    try {
      const [d, p] = await Promise.all([
        api.documents(token, filterProject ? Number(filterProject) : undefined),
        api.projects(token),
      ]);
      setDocs(d);
      setProjects(p);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Documents";
  }, []);

  useEffect(() => {
    load();
  }, [token, filterProject]);

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly || !file) {
      setError("Choose a file to upload");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("category", form.category);
      if (form.description.trim()) fd.append("description", form.description.trim());
      if (form.project_id) fd.append("project_id", form.project_id);
      fd.append("file", file);
      await api.uploadDocument(token, fd);
      setForm({ title: "", category: "project", description: "", project_id: "" });
      setFile(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      {!isReadonly ? (
        <section className="panel">
          <h2>Upload document</h2>
          <form className="form-grid" onSubmit={onUpload}>
            <label>
              Title
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project (optional)
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              File
              <input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <label className="span-2">
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="span-2">
              <button className="btn" type="submit" disabled={busy}>
                Upload
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head-row">
          <h2>Repository</h2>
          <label>
            Filter by project{" "}
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Project</th>
              <th>Uploaded</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.title}
                  {d.description ? <div className="muted">{d.description}</div> : null}
                </td>
                <td>{d.category}</td>
                <td>
                  {d.project_id
                    ? projects.find((p) => p.id === d.project_id)?.name || `#${d.project_id}`
                    : "—"}
                </td>
                <td>{new Date(d.created_at).toLocaleString()}</td>
                <td>
                  <a href={mediaUrl(d.file_path)} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
              </tr>
            ))}
            {!docs.length ? (
              <tr>
                <td colSpan={5}>No documents yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </>
  );
}
