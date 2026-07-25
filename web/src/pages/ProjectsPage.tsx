import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project, User } from "../types";

export function ProjectsPage() {
  const { token, isReadonly } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [contractors, setContractors] = useState<User[]>([]);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    location: "",
    description: "",
    chainage_from: "",
    chainage_to: "",
    contractor_id: "",
    surveyor_id: "",
  });

  const load = () => {
    if (!token) return;
    Promise.all([
      api.projects(token),
      api.users(token, "contractor"),
      api.users(token, "surveyor"),
    ])
      .then(([p, c, s]) => {
        setProjects(p);
        setContractors(c);
        setSurveyors(s);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Projects";
  }, []);

  useEffect(() => {
    load();
  }, [token]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    try {
      await api.createProject(token, {
        name: form.name,
        location: form.location,
        description: form.description || undefined,
        chainage_from: form.chainage_from || undefined,
        chainage_to: form.chainage_to || undefined,
        contractor_ids: form.contractor_id ? [Number(form.contractor_id)] : [],
        surveyor_ids: form.surveyor_id ? [Number(form.surveyor_id)] : [],
      });
      setForm({
        name: "",
        location: "",
        description: "",
        chainage_from: "",
        chainage_to: "",
        contractor_id: "",
        surveyor_id: "",
      });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {!isReadonly ? (
        <section className="panel">
          <h2>Create project</h2>
          <form className="form-grid" onSubmit={onCreate}>
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Location
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label>
              Chainage from
              <input
                value={form.chainage_from}
                onChange={(e) => setForm({ ...form, chainage_from: e.target.value })}
              />
            </label>
            <label>
              Chainage to
              <input
                value={form.chainage_to}
                onChange={(e) => setForm({ ...form, chainage_to: e.target.value })}
              />
            </label>
            <label>
              Contractor
              <select
                value={form.contractor_id}
                onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}
              >
                <option value="">Select…</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Surveyor
              <select
                value={form.surveyor_id}
                onChange={(e) => setForm({ ...form, surveyor_id: e.target.value })}
              >
                <option value="">Select…</option>
                {surveyors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="submit">
              Create project
            </button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Location</th>
              <th>Chainage</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{p.location}</td>
                <td>
                  {p.chainage_from || "—"} – {p.chainage_to || "—"}
                </td>
                <td>
                  {p.contractors.length} contractors · {p.surveyors.length} surveyors
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
