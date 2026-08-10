import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { OrgStaffDetail, StaffMeta } from "../types";

const empty = {
  project_name: "",
  position: "",
  name: "",
  date_of_joining: "",
  mobile_no: "",
  alternate_mobile_no: "",
  email_id: "",
};

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

  const canManage = Boolean(meta?.can_add) && !isReadonly;

  const grouped = useMemo(() => {
    const map = new Map<string, OrgStaffDetail[]>();
    for (const r of rows) {
      const key = r.organization;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

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

  const openCreate = () => {
    setEditId(null);
    setForm(empty);
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
          {canManage ? (
            <button className="btn" type="button" onClick={openCreate}>
              Add {orgTitle.split("—")[0].trim()} staff
            </button>
          ) : null}
        </div>

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
            <h2>{label}</h2>
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
            <p className="muted">
              Saving under: <strong>{meta?.my_organization_label || orgTitle}</strong>
            </p>
            <div className="form-grid">
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
