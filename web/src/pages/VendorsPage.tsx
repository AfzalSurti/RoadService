import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project, Vendor } from "../types";

const empty = {
  name: "",
  project_id: "",
  brief: "",
  progress_notes: "",
  delay_notes: "",
  escalation_matrix: "",
};

export function VendorsPage() {
  const { token, role, isReadonly } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    if (!token) return;
    try {
      const [v, p] = await Promise.all([api.vendors(token), api.projects(token)]);
      setVendors(v);
      setProjects(p);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vendors");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Vendors";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly || role !== "admin") return;
    setBusy(true);
    setError(null);
    try {
      await api.createVendor(token, {
        name: form.name.trim(),
        project_id: form.project_id ? Number(form.project_id) : undefined,
        brief: form.brief || undefined,
        progress_notes: form.progress_notes || undefined,
        delay_notes: form.delay_notes || undefined,
        escalation_matrix: form.escalation_matrix || undefined,
      });
      setForm(empty);
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <h2>Vendor profiles</h2>
          {role === "admin" && !isReadonly ? (
            <button className="btn" type="button" onClick={() => setShowForm(true)}>
              Add vendor
            </button>
          ) : null}
        </div>

        <div className="card-list">
          {vendors.map((v) => (
            <article className="panel nested" key={v.id}>
              <h3>{v.name}</h3>
              <p className="muted">
                Project:{" "}
                {v.project_id
                  ? projects.find((p) => p.id === v.project_id)?.name || `#${v.project_id}`
                  : "All / unassigned"}
              </p>
              {v.brief ? (
                <p>
                  <strong>Brief:</strong> {v.brief}
                </p>
              ) : null}
              {v.progress_notes ? (
                <p>
                  <strong>Progress:</strong> {v.progress_notes}
                </p>
              ) : null}
              {v.delay_notes ? (
                <p>
                  <strong>Delays:</strong> {v.delay_notes}
                </p>
              ) : null}
              {v.escalation_matrix ? (
                <p>
                  <strong>Escalation:</strong> {v.escalation_matrix}
                </p>
              ) : null}
            </article>
          ))}
          {!vendors.length ? <p className="muted">No vendors yet.</p> : null}
        </div>
      </section>

      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onCreate}>
            <h2>Add vendor</h2>
            <div className="form-grid">
              <label className="span-2">
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="span-2">
                Project
                <select
                  value={form.project_id}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                >
                  <option value="">Optional</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Brief
                <textarea
                  value={form.brief}
                  onChange={(e) => setForm({ ...form, brief: e.target.value })}
                />
              </label>
              <label className="span-2">
                Progress notes
                <textarea
                  value={form.progress_notes}
                  onChange={(e) => setForm({ ...form, progress_notes: e.target.value })}
                />
              </label>
              <label className="span-2">
                Delay notes
                <textarea
                  value={form.delay_notes}
                  onChange={(e) => setForm({ ...form, delay_notes: e.target.value })}
                />
              </label>
              <label className="span-2">
                Escalation matrix
                <textarea
                  value={form.escalation_matrix}
                  onChange={(e) => setForm({ ...form, escalation_matrix: e.target.value })}
                />
              </label>
            </div>
            <div className="btn-row">
              <button className="btn" type="submit" disabled={busy}>
                Save
              </button>
              <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
