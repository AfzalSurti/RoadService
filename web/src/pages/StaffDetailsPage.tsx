import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { OrgStaffDetail, Project, StaffMeta } from "../types";

const empty = {
  project_name: "",
  position: "",
  name: "",
  date_of_joining: "",
  mobile_no: "",
  alternate_mobile_no: "",
  email_id: "",
  organization: "",
};

const ORG_NAMES: Record<string, string> = { gmc: "GMC", nhimpl: "NHIPMPL", contractor: "Contractor" };

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !["section", "the", "and", "package"].includes(w));

/**
 * Staff "Project name" is free text ("JABALPUR - LAKHNADON SECTION"); match it to
 * the package whose name / short name / title shares the most words.
 */
function packageIndex(projectName: string, projects: Project[]): number {
  const mine = new Set(words(projectName));
  let best = -1;
  let bestScore = 0;
  projects.forEach((p, i) => {
    const theirs = new Set(words(`${p.name} ${p.short_name || ""} ${p.title || ""}`));
    let score = 0;
    for (const w of mine) if (theirs.has(w)) score += 1;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best === -1 ? Number.MAX_SAFE_INTEGER : best;
}

export function StaffDetailsPage() {
  const { token, role, isReadonly } = useAuth();
  const [rows, setRows] = useState<OrgStaffDetail[]>([]);
  const [meta, setMeta] = useState<StaffMeta | null>(null);
  const [filterOrg, setFilterOrg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  // Rows in package order (1 Jabalpur – Lakhnadon, 2 …, 3 …), then project text, then name.
  const sortedRows = useMemo(() => {
    const ordered = [...projects].sort((a, b) => a.id - b.id);
    return rows
      .map((r) => ({ r, pkg: packageIndex(r.project_name || "", ordered) }))
      .sort(
        (a, b) =>
          a.pkg - b.pkg ||
          (a.r.project_name || "").localeCompare(b.r.project_name || "", undefined, { sensitivity: "base" }) ||
          (a.r.name || "").localeCompare(b.r.name || "", undefined, { sensitivity: "base" })
      )
      .map((x) => x.r);
  }, [rows, projects]);

  const canManage = Boolean(meta?.can_add) && !isReadonly;
  // GMC Experts maintain all three sections and can upload one Excel for everyone.
  const canAll = Boolean(meta?.can_add_any) && !isReadonly;
  const [importInfo, setImportInfo] = useState<{ text: string; errors: string[] } | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, OrgStaffDetail[]>();
    for (const r of sortedRows) {
      const key = r.organization;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [sortedRows]);

  const load = async () => {
    if (!token) return;
    try {
      const [m, list] = await Promise.all([
        api.staffMeta(token),
        api.staffDetails(token, filterOrg || undefined),
      ]);
      setMeta(m);
      setRows(list);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load staff details");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Staff Details";
  }, []);

  useEffect(() => {
    void load();
  }, [token, filterOrg]);

  useEffect(() => {
    if (!token) return;
    api
      .projects(token)
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [token]);

  const openCreate = (org = "") => {
    setEditId(null);
    setForm({ ...empty, organization: org || meta?.my_organization || "" });
    setShowForm(true);
    setMsg(null);
  };

  const openEdit = (row: OrgStaffDetail) => {
    if (!row.can_edit) return;
    setEditId(row.id);
    setForm({
      project_name: row.project_name,
      position: row.position,
      name: row.name,
      date_of_joining: String(row.date_of_joining).slice(0, 10),
      mobile_no: row.mobile_no,
      alternate_mobile_no: row.alternate_mobile_no || "",
      email_id: row.email_id,
      organization: row.organization,
    });
    setShowForm(true);
    setMsg(null);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !canManage) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    const body = {
      project_name: form.project_name.trim(),
      position: form.position.trim(),
      name: form.name.trim(),
      date_of_joining: form.date_of_joining,
      mobile_no: form.mobile_no.trim(),
      alternate_mobile_no: form.alternate_mobile_no.trim() || undefined,
      email_id: form.email_id.trim(),
      organization: canAll ? form.organization || undefined : undefined,
    };
    try {
      if (editId) await api.updateStaffDetail(token, editId, body);
      else await api.createStaffDetail(token, body);
      setShowForm(false);
      setMsg(editId ? "Staff detail updated" : "Staff detail added");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const orgTitle =
    role === "admin"
      ? "GMC (HQ + Site) — your staff"
      : role === "government"
        ? "NHIPMPL / NHIMPL — your staff"
        : role === "contractor"
          ? "Contractor — your staff"
          : "Organisation staff";

  return (
    <>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <section className="panel">
        <div className="panel-head-row">
          <div>
            <h2>Organisation staff details</h2>
            <p className="muted" style={{ margin: 0 }}>
              Key &amp; sub-key professionals (GMC · NHIPMPL · Contractor). Everyone can view all
              records; you can edit only staff under your own organisation
              {meta?.my_organization_label ? ` (${meta.my_organization_label})` : ""}.
            </p>
          </div>
          {canAll ? (
            <div className="btn-row">
              <button
                className="btn ghost"
                type="button"
                onClick={async () => {
                  if (!token) return;
                  try {
                    const blob = await api.downloadStaffTemplate(token);
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = "staff_details_template.xlsx";
                    a.click();
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : "Download failed");
                  }
                }}
              >
                Download Excel template
              </button>
              <label className={`btn${busy ? " disabled" : ""}`} style={{ cursor: "pointer" }}>
                {busy ? "Uploading…" : "Upload Excel (all staff)"}
                <input
                  type="file"
                  accept=".xlsx,.xlsm"
                  hidden
                  disabled={busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!token || !f) return;
                    setBusy(true);
                    setError(null);
                    setImportInfo(null);
                    try {
                      const r = await api.importStaff(token, f);
                      setImportInfo({
                        text: `${r.added} added, ${r.updated} updated${r.error_count ? `, ${r.error_count} row(s) skipped` : ""}.`,
                        errors: r.errors,
                      });
                      await load();
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : "Upload failed");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
            </div>
          ) : canManage ? (
            <button className="btn" type="button" onClick={() => openCreate()}>
              Add {orgTitle.split("—")[0].trim()} staff
            </button>
          ) : null}
        </div>
        {importInfo ? (
          <div className={importInfo.errors.length ? "error" : "ok"} style={{ marginTop: "0.75rem" }}>
            <strong>Excel upload:</strong> {importInfo.text}
            {importInfo.errors.length ? (
              <ul style={{ margin: "0.4rem 0 0" }}>
                {importInfo.errors.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <label style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
          Filter organisation
          <select value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
            <option value="">All</option>
            {(meta?.organizations || []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {["gmc", "nhimpl", "contractor"].map((orgKey) => {
        const list = grouped.get(orgKey) || [];
        const label =
          meta?.organizations.find((o) => o.id === orgKey)?.label ||
          (orgKey === "gmc" ? "GMC" : orgKey === "nhimpl" ? "NHIPMPL" : "Contractor");
        if (filterOrg && filterOrg !== orgKey) return null;
        return (
          <section className="panel" key={orgKey}>
            <div className="panel-head-row">
              <h2>{label}</h2>
              {canAll || (canManage && meta?.my_organization === orgKey) ? (
                <button className="btn" type="button" onClick={() => openCreate(orgKey)}>
                  + Add {ORG_NAMES[orgKey]} staff
                </button>
              ) : null}
            </div>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Position</th>
                    <th>Name</th>
                    <th>Date of Joining</th>
                    <th>Mobile No</th>
                    <th>Alternate Mo No</th>
                    <th>Email ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td>{r.project_name}</td>
                      <td>{r.position}</td>
                      <td>{r.name}</td>
                      <td>{String(r.date_of_joining).slice(0, 10)}</td>
                      <td>{r.mobile_no}</td>
                      <td>{r.alternate_mobile_no || "—"}</td>
                      <td>{r.email_id}</td>
                      <td>
                        {r.can_edit && canManage ? (
                          <>
                            <button className="btn ghost" type="button" onClick={() => openEdit(r)}>
                              Edit
                            </button>{" "}
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={async () => {
                                if (!token || !confirm(`Delete ${r.name}?`)) return;
                                await api.deleteStaffDetail(token, r.id);
                                await load();
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="muted">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!list.length ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        No staff listed for this organisation yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={onSave}>
            <h2>{editId ? "Edit staff detail" : "Add staff detail"}</h2>
            {canAll ? null : (
              <p className="muted">
                Saving under: <strong>{meta?.my_organization_label || orgTitle}</strong>
              </p>
            )}
            <div className="form-grid">
              {canAll ? (
                <label className="span-2">
                  Organisation *
                  <select
                    required
                    value={form.organization}
                    onChange={(e) => setForm({ ...form, organization: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {(meta?.organizations || []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="span-2">
                Project Name *
                <input
                  required
                  value={form.project_name}
                  onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                />
              </label>
              <label>
                Position *
                <input
                  required
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value })}
                />
              </label>
              <label>
                Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Date of Joining *
                <input
                  type="date"
                  required
                  value={form.date_of_joining}
                  onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })}
                />
              </label>
              <label>
                Mobile No *
                <input
                  required
                  value={form.mobile_no}
                  onChange={(e) => setForm({ ...form, mobile_no: e.target.value })}
                />
              </label>
              <label>
                Alternate Mo No (optional)
                <input
                  value={form.alternate_mobile_no}
                  onChange={(e) => setForm({ ...form, alternate_mobile_no: e.target.value })}
                />
              </label>
              <label className="span-2">
                Email ID *
                <input
                  type="email"
                  required
                  value={form.email_id}
                  onChange={(e) => setForm({ ...form, email_id: e.target.value })}
                />
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
