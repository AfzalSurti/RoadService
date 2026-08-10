import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project, RateItem } from "../types";
import * as v from "../lib/validation";

const emptyForm = {
  item_no: "",
  description: "",
  unit: "km",
  boq_quantity: "",
  rate: "",
  remarks: "",
};

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RatesPage() {
  const { token, role, isReadonly } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | "">("");
  const [items, setItems] = useState<RateItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<v.FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [qtyItemId, setQtyItemId] = useState<number | null>(null);
  const [qtyValue, setQtyValue] = useState("");
  const [qtyNote, setQtyNote] = useState("");
  const canEnterQty = !isReadonly && (role === "admin" || role === "surveyor" || role === "contractor");

  const load = async () => {
    if (!token || !projectId) {
      setItems([]);
      return;
    }
    try {
      const data = await api.rateItems(token, Number(projectId));
      setItems(data as RateItem[]);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load rates");
    }
  };

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Rates (BOQ)";
  }, []);

  useEffect(() => {
    if (!token) return;
    api.projects(token).then((p) => {
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    });
  }, [token]);

  useEffect(() => {
    load();
  }, [token, projectId]);

  const totals = useMemo(() => {
    const boq = items.reduce((s, i) => s + Number(i.boq_amount || 0), 0);
    const exec = items.reduce((s, i) => s + Number(i.executed_amount || 0), 0);
    return {
      boq,
      exec,
      pct: boq ? Math.round((exec / boq) * 10000) / 100 : null,
    };
  }, [items]);

  const validate = () =>
    v.collect({
      item_no: v.required(form.item_no, "BOQ item no"),
      description: v.minLength(form.description, 2, "Description"),
      unit: v.required(form.unit, "Unit"),
      boq_quantity: v.required(form.boq_quantity, "Quantity") ||
        (Number(form.boq_quantity) > 0 ? null : "Quantity must be greater than 0"),
      rate: v.required(form.rate, "Rate") ||
        (Number(form.rate) >= 0 ? null : "Rate must be 0 or more"),
    });

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !projectId || isReadonly) return;
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError(v.firstError(errors));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createRateItem(token, {
        project_id: Number(projectId),
        item_no: form.item_no.trim(),
        description: form.description.trim(),
        unit: form.unit.trim(),
        boq_quantity: Number(form.boq_quantity),
        rate: Number(form.rate),
        remarks: form.remarks.trim() || undefined,
      });
      setForm(emptyForm);
      setShowModal(false);
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
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>BOQ as per CA</h2>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: 0 }}>
              Project
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!isReadonly ? (
            <button className="btn" type="button" disabled={!projectId} onClick={() => setShowModal(true)}>
              Add item
            </button>
          ) : null}
        </div>

        {projectId ? (
          <>
            <div className="stat-grid" style={{ marginTop: "1rem" }}>
              <div className="stat">
                <span>Total BOQ amount</span>
                <strong>₹ {money(totals.boq)}</strong>
              </div>
              <div className="stat">
                <span>Executed value</span>
                <strong>₹ {money(totals.exec)}</strong>
              </div>
              <div className="stat">
                <span>% progress</span>
                <strong>{totals.pct == null ? "—" : `${totals.pct}%`}</strong>
              </div>
            </div>
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Highlighted executed / value / % progress columns are <strong>not typed in Add BOQ item</strong>.
              They come from quantity entries (Record qty below, or mobile field entry): cumulative qty × rate
              updates value of work done and % progress automatically.
            </p>
          </>
        ) : null}

        <div className="table-scroll">
          <table className="data rate-table">
            <thead>
              <tr>
                <th rowSpan={2}>BOQ item no</th>
                <th rowSpan={2}>Brief description</th>
                <th colSpan={4}>BOQ as per CA</th>
                <th colSpan={2}>Quantity executed</th>
                <th colSpan={2}>Value of work done</th>
                <th rowSpan={2}>% progress</th>
                <th rowSpan={2}>Remarks</th>
                {!isReadonly ? <th rowSpan={2}></th> : null}
              </tr>
              <tr>
                <th>Unit</th>
                <th>Quantity</th>
                <th>Rate ₹</th>
                <th>Amount ₹</th>
                <th>Cumulative</th>
                <th>This entry total</th>
                <th>Cumulative ₹</th>
                <th>Auto (qty × rate)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.item_no}</td>
                  <td>{i.description}</td>
                  <td>{i.unit}</td>
                  <td>{i.boq_quantity}</td>
                  <td>{money(Number(i.rate))}</td>
                  <td>{money(Number(i.boq_amount))}</td>
                  <td>{i.executed_quantity}</td>
                  <td>{i.executed_quantity}</td>
                  <td>{money(Number(i.executed_amount))}</td>
                  <td>{money(Number(i.executed_amount))}</td>
                  <td>{i.progress_pct == null ? "—" : `${i.progress_pct}%`}</td>
                  <td>{i.remarks || "—"}</td>
                  {!isReadonly ? (
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canEnterQty ? (
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => {
                            setQtyItemId(i.id);
                            setQtyValue("");
                            setQtyNote("");
                          }}
                        >
                          Record qty
                        </button>
                      ) : null}{" "}
                      {role === "admin" ? (
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={async () => {
                            if (!token || !confirm(`Delete item ${i.item_no}?`)) return;
                            await api.deleteRateItem(token, i.id);
                            load();
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={isReadonly ? 12 : 13}>
                    {projectId ? "No BOQ items yet. Click Add item." : "Select a project."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showModal ? (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Add BOQ item</h2>
            <p className="muted">
              Fill only CA rate fields below. Amount = Quantity × Rate. Executed quantity and % progress
              are filled later via Record qty (not in this form).
            </p>
            <form className="form-grid" onSubmit={onCreate} noValidate>
              <label>
                BOQ item no
                <input
                  value={form.item_no}
                  onChange={(e) => setForm({ ...form, item_no: e.target.value })}
                  placeholder="e.g. 1.1"
                />
                {fieldErrors.item_no ? <span className="field-error">{fieldErrors.item_no}</span> : null}
              </label>
              <label>
                Brief description of item
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. Providing and laying bituminous concrete"
                />
                {fieldErrors.description ? (
                  <span className="field-error">{fieldErrors.description}</span>
                ) : null}
              </label>
              <label>
                Unit
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="km / sqm / cum"
                />
                {fieldErrors.unit ? <span className="field-error">{fieldErrors.unit}</span> : null}
              </label>
              <label>
                Quantity (BOQ)
                <input
                  type="number"
                  step="any"
                  value={form.boq_quantity}
                  onChange={(e) => setForm({ ...form, boq_quantity: e.target.value })}
                />
                {fieldErrors.boq_quantity ? (
                  <span className="field-error">{fieldErrors.boq_quantity}</span>
                ) : null}
              </label>
              <label>
                Rate ₹
                <input
                  type="number"
                  step="any"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
                {fieldErrors.rate ? <span className="field-error">{fieldErrors.rate}</span> : null}
              </label>
              <label>
                Amount ₹ (auto)
                <input
                  disabled
                  value={
                    form.boq_quantity && form.rate
                      ? money(Number(form.boq_quantity) * Number(form.rate))
                      : ""
                  }
                />
              </label>
              <label>
                Remarks
                <input
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </label>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save item"}
                </button>
                <button className="btn ghost" type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {qtyItemId != null ? (
        <div className="modal-backdrop" onClick={() => setQtyItemId(null)}>
          <form
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!token || !qtyValue || Number(qtyValue) <= 0) {
                setError("Enter a quantity greater than 0");
                return;
              }
              setBusy(true);
              setError(null);
              try {
                await api.addQuantity(token, qtyItemId, {
                  quantity: Number(qtyValue),
                  note: qtyNote.trim() || undefined,
                });
                setQtyItemId(null);
                await load();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Quantity save failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Record executed quantity</h2>
            <p className="muted">
              This updates Quantity executed, Value of work done, and % progress for the BOQ item.
            </p>
            <div className="form-grid">
              <label>
                This entry quantity
                <input
                  type="number"
                  step="any"
                  required
                  value={qtyValue}
                  onChange={(e) => setQtyValue(e.target.value)}
                />
              </label>
              <label>
                Note
                <input value={qtyNote} onChange={(e) => setQtyNote(e.target.value)} />
              </label>
            </div>
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save quantity"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setQtyItemId(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
