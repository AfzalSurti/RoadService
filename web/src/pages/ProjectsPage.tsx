import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ProjectForm, projectToForm, type ProjectFormValues } from "../components/ProjectForm";
import { projectShortName, projectTitle, usePackageScope } from "../lib/projectScope";
import type { Project, ProjectRateSummary, User } from "../types";

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Form values → API body: blank optional text is stored as null. */
function toBody(v: ProjectFormValues) {
  const opt = (s: string) => s.trim() || null;
  return {
    name: v.name.trim(),
    location: v.location.trim(),
    short_name: opt(v.short_name),
    title: opt(v.title),
    description: opt(v.description),
    chainage_from: opt(v.chainage_from),
    chainage_to: opt(v.chainage_to),
    contractor_ids: v.contractor_ids,
    surveyor_ids: v.surveyor_ids,
  };
}

export function ProjectsPage() {
  const { token, role, isReadonly } = useAuth();
  const canManage = role === "admin" && !isReadonly;
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = Number(searchParams.get("project") || 0) || null;
  const editing = searchParams.get("edit") === "1";
  const [projects, setProjects] = useState<Project[]>([]);
  const [summaries, setSummaries] = useState<Record<number, ProjectRateSummary>>({});
  const [contractors, setContractors] = useState<User[]>([]);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Sidebar package scope: only the chosen packages are listed.
  const { inScope } = usePackageScope();
  const sortedProjects = useMemo(
    () => projects.filter((p) => inScope(p.id)).sort((a, b) => a.id - b.id),
    [projects, inScope]
  );
  const selected = useMemo(
    () => (highlightId ? sortedProjects.find((p) => p.id === highlightId) || null : null),
    [highlightId, sortedProjects]
  );
  const selectedSum = selected ? summaries[selected.id] : undefined;

  const selectProject = (id: number, edit = false) => {
    setSearchParams(edit ? { project: String(id), edit: "1" } : { project: String(id) });
  };

  const load = () => {
    if (!token) return;
    Promise.all([
      api.projects(token),
      canManage ? api.users(token, "contractor") : Promise.resolve([] as User[]),
      canManage ? api.users(token, "surveyor") : Promise.resolve([] as User[]),
    ])
      .then(async ([p, c, s]) => {
        setProjects(p);
        setContractors(c);
        setSurveyors(s);
        const entries = await Promise.all(
          p.map(async (proj) => {
            try {
              return [proj.id, await api.projectRateSummary(token, proj.id)] as const;
            } catch {
              return null;
            }
          })
        );
        const map: Record<number, ProjectRateSummary> = {};
        for (const e of entries) if (e) map[e[0]] = e[1];
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

  const onCreate = async (values: ProjectFormValues) => {
    if (!token) return;
    const body = toBody(values);
    const created = await api.createProject(token, {
      ...body,
      short_name: body.short_name ?? undefined,
      title: body.title ?? undefined,
      description: body.description ?? undefined,
      chainage_from: body.chainage_from ?? undefined,
      chainage_to: body.chainage_to ?? undefined,
    });
    if (values.photo) await api.uploadProjectImage(token, created.id, values.photo);
    setShowCreate(false);
    setMsg(`Project “${projectShortName(created)}” created.`);
    load();
    selectProject(created.id);
  };

  const onUpdate = async (values: ProjectFormValues) => {
    if (!token || !selected) return;
    const updated = await api.updateProject(token, selected.id, toBody(values));
    if (values.photo) await api.uploadProjectImage(token, selected.id, values.photo);
    setMsg(`Project “${projectShortName(updated)}” saved. The dashboard shows the new details.`);
    load();
    selectProject(updated.id);
  };

  const onRemove = async () => {
    if (!token || !selected) return;
    const label = projectShortName(selected);
    if (
      !window.confirm(
        `Remove “${label}” from the portal?\n\nIt disappears from the dashboard and project lists. ` +
          "Its issues, documents and invoices are kept."
      )
    )
      return;
    try {
      await api.updateProject(token, selected.id, { is_active: false });
      setMsg(`Project “${label}” removed.`);
      setSearchParams({});
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <h2>All projects</h2>
          {canManage ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setShowCreate((v) => !v);
                setMsg(null);
              }}
            >
              {showCreate ? "Hide create form" : "Add project"}
            </button>
          ) : null}
        </div>
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
            {sortedProjects.map((p) => {
              const sum = summaries[p.id];
              return (
                <tr
                  key={p.id}
                  className={`clickable-row${highlightId === p.id ? " row-active" : ""}`}
                  onClick={() => selectProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectProject(p.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td>{p.id}</td>
                  <td className="project-name-cell">
                    <strong>{projectShortName(p)}</strong>
                    {p.title ? <span className="muted">{p.title}</span> : null}
                  </td>
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
                  <td className="btn-row" onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <button type="button" className="btn ghost" onClick={() => selectProject(p.id, true)}>
                        Edit
                      </button>
                    ) : null}
                    <Link to={`/rates?project=${p.id}`}>Rates</Link>
                  </td>
                </tr>
              );
            })}
            {!sortedProjects.length ? (
              <tr>
                <td colSpan={9}>No projects yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {showCreate && canManage ? (
        <section className="panel">
          <h2>Create project</h2>
          <ProjectForm
            initial={projectToForm(null)}
            contractors={contractors}
            surveyors={surveyors}
            submitLabel="Create project"
            onSubmit={onCreate}
            onCancel={() => setShowCreate(false)}
          />
        </section>
      ) : null}

      {selected && editing && canManage ? (
        <section className="panel">
          <h2>Edit · {projectShortName(selected)}</h2>
          <ProjectForm
            key={selected.id}
            currentImage={selected.image_url}
            initial={projectToForm(selected)}
            contractors={contractors}
            surveyors={surveyors}
            submitLabel="Save changes"
            onSubmit={onUpdate}
            onCancel={() => selectProject(selected.id)}
          />
        </section>
      ) : selected ? (
        <section className="panel">
          <div className="selected-project-banner">
            <div>
              <strong>
                #{selected.id} · {projectShortName(selected)}
              </strong>
              {selected.title ? <p>{projectTitle(selected)}</p> : null}
              <p>
                {selected.location}
                {selected.chainage_from || selected.chainage_to
                  ? ` · ${selected.chainage_from || "—"} – ${selected.chainage_to || "—"}`
                  : ""}
              </p>
              <p className="muted" style={{ marginTop: "0.35rem" }}>
                {selected.contractors.length} contractors · {selected.surveyors.length} GMC representatives
                {selectedSum
                  ? ` · BOQ ₹ ${money(selectedSum.total_boq_amount)} · Executed ₹ ${money(
                      selectedSum.total_executed_amount
                    )} · ${selectedSum.progress_pct == null ? "—" : `${selectedSum.progress_pct}%`} progress`
                  : ""}
              </p>
              {selected.description ? <p className="project-overview">{selected.description}</p> : null}
            </div>
            <div className="btn-row">
              {canManage ? (
                <button type="button" className="btn" onClick={() => selectProject(selected.id, true)}>
                  Edit details
                </button>
              ) : null}
              <Link className="btn ghost" to={`/rates?project=${selected.id}`}>
                Open rates
              </Link>
              <Link className="btn ghost" to={`/issues?project=${selected.id}`}>
                Defects
              </Link>
              {canManage ? (
                <button type="button" className="btn ghost danger" onClick={onRemove}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <p className="muted">Select a project row above to see details{canManage ? " or edit it" : ""}.</p>
      )}
    </>
  );
}
