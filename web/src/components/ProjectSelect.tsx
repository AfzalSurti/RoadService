import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project } from "../types";

type Props = {
  value: string | number | "";
  onChange: (projectId: string) => void;
  label?: string;
  required?: boolean;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
};

/** Always loads the full project list for selects (avoids empty/missing options). */
export function ProjectSelect({
  value,
  onChange,
  label = "Project / Package",
  required = false,
  allowAll = false,
  allLabel = "All projects",
  className,
  disabled = false,
}: Props) {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .projects(token)
      .then((p) => {
        setProjects([...p].sort((a, b) => a.name.localeCompare(b.name)));
        setError(null);
      })
      .catch((e: Error) => {
        setProjects([]);
        setError(e.message || "Could not load projects");
      });
  }, [token]);

  return (
    <label className={className}>
      {label}
      <select
        required={required && !allowAll}
        disabled={disabled}
        value={value === "" || value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowAll ? <option value="">{allLabel}</option> : <option value="">Select project…</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.location && p.location !== p.name ? ` · ${p.location}` : ""}
          </option>
        ))}
      </select>
      {error ? <small className="field-error">{error}</small> : null}
      {!error && !projects.length ? <small className="muted">No projects found yet.</small> : null}
    </label>
  );
}
