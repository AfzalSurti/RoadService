import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import * as v from "../lib/validation";
import type { Project, ProjectRateSummary, User } from "../types";

const emptyForm = {
  name: "",
  location: "",
  description: "",
  chainage_from: "",
  chainage_to: "",
  contractor_id: "",
  surveyor_id: "",
};

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProjectsPage() {
  const { token, isReadonly } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ProjectRateSummary>>({});
  const [contractors, setContractors] = useState<User[]>([]);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<v.FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const load = () => {
    if (!token) return;
    Promise.all([
      api.projects(token),
      api.users(token, "contractor"),
      api.users(token, "surveyor"),
    ])
      .then(async ([p, c, s]) => {
        setProjects(p);
        setContractors(c);
        setSurveyors(s);
        const entries = await Promise.all(
          p.map(async (proj) => {
            try {
              const sum = await api.projectRateSummary(token, proj.id);
              return [proj.id, sum] as const;
            } catch {
              return null;
            }
          })
        );
        const map: Record<number, ProjectRateSummary> = {};
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
        }
        setSummaries(map);
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

  const validate = (next = form) => {
    const errors = v.collect({
      name: v.minLength(next.name, 2, "Name"),
      location: v.minLength(next.location, 2, "Location"),
      description:
        next.description.trim() && next.description.trim().length < 3
          ? "Description must be at least 3 characters if provided"
          : null,
      contractor_id: next.contractor_id ? null : "Select a contractor",
      surveyor_id: next.surveyor_id ? null : "Select a GMC representative",
    });
    setFieldErrors(errors);
    return errors;
  };

  const setField = (key: keyof typeof emptyForm, value: string) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (touched[key]) validate(next);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || isReadonly) return;
    setTouched({
      name: true,
      location: true,
      description: true,
      contractor_id: true,
      surveyor_id: true,
    });
    const errors = validate();
    if (Object.keys(errors).length) {
      setError(v.firstError(errors));
      return;
    }
    setError(null);
    try {
      await api.createProject(token, {
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim() || undefined,
        chainage_from: form.chainage_from.trim() || undefined,
        chainage_to: form.chainage_to.trim() || undefined,
        contractor_ids: form.contractor_id ? [Number(form.contractor_id)] : [],
        surveyor_ids: form.surveyor_id ? [Number(form.surveyor_id)] : [],
      });
      setForm(emptyForm);
      setTouched({});
      setFieldErrors({});
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
          <form className="form-grid" onSubmit={onCreate} noValidate>
            <label>
              Name
              <input
                value={form.name}
                aria-invalid={Boolean(touched.name && fieldErrors.name)}
                onChange={(e) => setField("name", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, name: true }));
                  validate();
                }}
              />
              {touched.name && fieldErrors.name ? (
                <span className="field-error">{fieldErrors.name}</span>
              ) : null}
            </label>
            <label>
              Location
              <input
                value={form.location}
                aria-invalid={Boolean(touched.location && fieldErrors.location)}
                onChange={(e) => setField("location", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, location: true }));
                  validate();
                }}
              />
              {touched.location && fieldErrors.location ? (
                <span className="field-error">{fieldErrors.location}</span>
              ) : null}
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                aria-invalid={Boolean(touched.description && fieldErrors.description)}
                onChange={(e) => setField("description", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, description: true }));
                  validate();
                }}
              />
              {touched.description && fieldErrors.description ? (
                <span className="field-error">{fieldErrors.description}</span>
              ) : null}
            </label>
            <label>
              Chainage from
              <input
                value={form.chainage_from}
                onChange={(e) => setField("chainage_from", e.target.value)}
                placeholder="e.g. 10+000"
              />
            </label>
            <label>
              Chainage to
              <input
                value={form.chainage_to}
                onChange={(e) => setField("chainage_to", e.target.value)}
                placeholder="e.g. 25+500"
              />
            </label>
            <label>
              Contractor
              <select
                value={form.contractor_id}
                aria-invalid={Boolean(touched.contractor_id && fieldErrors.contractor_id)}
                onChange={(e) => setField("contractor_id", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, contractor_id: true }));
                  validate();
                }}
              >
                <option value="">Select…</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              {touched.contractor_id && fieldErrors.contractor_id ? (
                <span className="field-error">{fieldErrors.contractor_id}</span>
              ) : null}
            </label>
            <label>
              GMC representative
              <select
                value={form.surveyor_id}
                aria-invalid={Boolean(touched.surveyor_id && fieldErrors.surveyor_id)}
                onChange={(e) => setField("surveyor_id", e.target.value)}
                onBlur={() => {
                  setTouched((t) => ({ ...t, surveyor_id: true }));
                  validate();
                }}
              >
                <option value="">Select…</option>
                {surveyors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
              {touched.surveyor_id && fieldErrors.surveyor_id ? (
                <span className="field-error">{fieldErrors.surveyor_id}</span>
              ) : null}
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
              <th>BOQ amount</th>
              <th>Executed value</th>
              <th>% progress</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const sum = summaries[p.id];
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.location}</td>
                  <td>
                    {p.chainage_from || "—"} – {p.chainage_to || "—"}
                  </td>
                  <td>
                    {p.contractors.length} contractors · {p.surveyors.length} GMC representatives
                  </td>
                  <td>{sum ? `₹ ${money(sum.total_boq_amount)}` : "—"}</td>
                  <td>{sum ? `₹ ${money(sum.total_executed_amount)}` : "—"}</td>
                  <td>{sum?.progress_pct == null ? "—" : `${sum.progress_pct}%`}</td>
                  <td>
                    <Link to="/rates">Rates</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
