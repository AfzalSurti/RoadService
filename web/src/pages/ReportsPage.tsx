import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Project } from "../types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "import" | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    report_title: "RoadService Issues Report",
    project_id: "",
    package_name: "",
    date_from: "",
    date_to: "",
    prepared_by: "",
    remarks: "",
  });

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Reports & Analytics";
  }, []);

  useEffect(() => {
    if (!token) return;
    api.projects(token).then(setProjects).catch(() => setProjects([]));
  }, [token]);

  const onDownload = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!form.report_title.trim() || !form.prepared_by.trim()) {
      setError("Report title and Prepared by are required before download");
      return;
    }
    setBusy("download");
    setError(null);
    setMsg(null);
    try {
      const blob = await api.exportExcel(token, {
        project_id: form.project_id ? Number(form.project_id) : undefined,
        date_from: form.date_from || undefined,
        date_to: form.date_to || undefined,
        package_name: form.package_name || undefined,
        report_title: form.report_title.trim(),
        prepared_by: form.prepared_by.trim(),
        remarks: form.remarks || undefined,
      });
      downloadBlob(blob, `roadservice_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setMsg("Excel downloaded. Edit the Issues sheet if needed, then import it below.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const onImport = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !importFile) {
      setError("Choose an Excel file to import");
      return;
    }
    setBusy("import");
    setError(null);
    setMsg(null);
    try {
      const result = await api.importExcel(token, importFile);
      setMsg(
        `Imported from ${result.filename}: updated ${result.updated}, skipped ${result.skipped}.` +
          (result.errors?.length ? ` Notes: ${result.errors.slice(0, 3).join("; ")}` : "")
      );
      setImportFile(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <h2>Excel report (download &amp; import)</h2>
      <p className="muted">
        Fill the required details, download the Excel, then import the same Excel so issue data is
        taken directly from the file.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}

      <form className="form-grid" onSubmit={onDownload} style={{ marginBottom: "1.25rem" }}>
        <label>
          Report title *
          <input
            required
            value={form.report_title}
            onChange={(e) => setForm({ ...form, report_title: e.target.value })}
          />
        </label>
        <label>
          Prepared by *
          <input
            required
            value={form.prepared_by}
            onChange={(e) => setForm({ ...form, prepared_by: e.target.value })}
            placeholder="Your name / agency"
          />
        </label>
        <label>
          Project
          <select
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Package / Stretch
          <input
            value={form.package_name}
            onChange={(e) => setForm({ ...form, package_name: e.target.value })}
            placeholder="e.g. Jabalpur - Lakhnadon"
          />
        </label>
        <label>
          Period from
          <input
            type="date"
            value={form.date_from}
            onChange={(e) => setForm({ ...form, date_from: e.target.value })}
          />
        </label>
        <label>
          Period to
          <input
            type="date"
            value={form.date_to}
            onChange={(e) => setForm({ ...form, date_to: e.target.value })}
          />
        </label>
        <label className="span-2">
          Remarks
          <textarea
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="Optional notes shown on the Report Details sheet"
          />
        </label>
        <div className="span-2">
          <button className="btn" type="submit" disabled={!!busy}>
            {busy === "download" ? "Preparing Excel…" : "Download Excel"}
          </button>
        </div>
      </form>

      <form className="form-grid" onSubmit={onImport}>
        <label className="span-2">
          Import Excel (Issues sheet — data taken from this file)
          <input
            type="file"
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="span-2">
          <button className="btn secondary" type="submit" disabled={!!busy || !importFile}>
            {busy === "import" ? "Importing…" : "Import Excel"}
          </button>
        </div>
      </form>
    </section>
  );
}
