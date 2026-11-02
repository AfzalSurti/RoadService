import { FormEvent, useState } from "react";
import type { Project, User } from "../types";

export type ProjectFormValues = {
  short_name: string;
  title: string;
  name: string;
  location: string;
  chainage_from: string;
  chainage_to: string;
  description: string;
  contractor_ids: number[];
  surveyor_ids: number[];
};

export function projectToForm(p?: Project | null): ProjectFormValues {
  return {
    short_name: p?.short_name || "",
    title: p?.title || "",
    name: p?.name || "",
    location: p?.location || "",
    chainage_from: p?.chainage_from || "",
    chainage_to: p?.chainage_to || "",
    description: p?.description || "",
    contractor_ids: p?.contractors.map((u) => u.id) || [],
    surveyor_ids: p?.surveyors.map((u) => u.id) || [],
  };
}

function TeamPicker({
  label,
  users,
  selected,
  onChange,
  empty,
}: {
  label: string;
  users: User[];
  selected: number[];
  onChange: (ids: number[]) => void;
  empty: string;
}) {
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset className="team-picker">
      <legend>{label}</legend>
      {users.length ? (
        users.map((u) => (
          <label key={u.id} className="team-picker-option">
            <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
            <span>
              {u.full_name}
              <small className="muted"> · {u.email}</small>
            </span>
          </label>
        ))
      ) : (
        <p className="muted">{empty}</p>
      )}
    </fieldset>
  );
}

/** Create / edit form for a project package — every field the portal shows is editable here. */
export function ProjectForm({
  initial,
  contractors,
  surveyors,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProjectFormValues;
  contractors: User[];
  surveyors: User[];
  submitLabel: string;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof ProjectFormValues, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Package code must be at least 2 characters";
    if (form.location.trim().length < 2) next.location = "Location must be at least 2 characters";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form-grid project-form" onSubmit={submit} noValidate>
      {error ? <div className="error span-2">{error}</div> : null}

      <h3 className="span-2 form-section">Names</h3>
      <label>
        Short name <small className="muted">(dashboard tile)</small>
        <input
          value={form.short_name}
          onChange={(e) => set("short_name", e.target.value)}
          placeholder="e.g. Mahagaon – Khawasa"
        />
      </label>
      <label>
        Package code
        <input
          value={form.name}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. Lakhnadon - Khawasa"
        />
        {errors.name ? <span className="field-error">{errors.name}</span> : null}
      </label>
      <label className="span-2">
        Official title
        <textarea
          rows={2}
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Tolling, Operation, Maintenance & Transfer of …"
        />
      </label>

      <h3 className="span-2 form-section">Location</h3>
      <label className="span-2">
        Location
        <input
          value={form.location}
          aria-invalid={Boolean(errors.location)}
          onChange={(e) => set("location", e.target.value)}
          placeholder="e.g. NH-44, Madhya Pradesh"
        />
        {errors.location ? <span className="field-error">{errors.location}</span> : null}
      </label>
      <label>
        Chainage from
        <input value={form.chainage_from} onChange={(e) => set("chainage_from", e.target.value)} placeholder="e.g. 624+480" />
      </label>
      <label>
        Chainage to
        <input value={form.chainage_to} onChange={(e) => set("chainage_to", e.target.value)} placeholder="e.g. 653+770" />
      </label>

      <h3 className="span-2 form-section">Package overview</h3>
      <label className="span-2">
        Overview <small className="muted">(shown when hovering the package on the dashboard; blank line = new paragraph)</small>
        <textarea rows={8} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>

      <h3 className="span-2 form-section">Team</h3>
      <div className="span-2 team-grid">
        <TeamPicker
          label="Contractors"
          users={contractors}
          selected={form.contractor_ids}
          onChange={(ids) => setForm((f) => ({ ...f, contractor_ids: ids }))}
          empty="No contractor users yet — add them under Users."
        />
        <TeamPicker
          label="GMC representatives"
          users={surveyors}
          selected={form.surveyor_ids}
          onChange={(ids) => setForm((f) => ({ ...f, surveyor_ids: ids }))}
          empty="No GMC representative users yet — add them under Users."
        />
      </div>
      {!form.contractor_ids.length || !form.surveyor_ids.length ? (
        <p className="span-2 form-hint">
          Issues can only be raised on this package once it has at least one GMC representative, and they are
          auto-assigned to the first contractor.
        </p>
      ) : null}

      <div className="span-2 btn-row">
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel ? (
          <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
