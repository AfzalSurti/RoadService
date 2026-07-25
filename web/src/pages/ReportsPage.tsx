import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const el = document.getElementById("page-title");
    if (el) el.textContent = "Reports & Analytics";
  }, []);

  return (
    <section className="panel">
      <h2>Generate report</h2>
      <p className="muted">Export issue data from the FastAPI reporting endpoints.</p>
      {error ? <div className="error">{error}</div> : null}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          className="btn"
          type="button"
          disabled={!!busy}
          onClick={async () => {
            if (!token) return;
            setBusy("excel");
            setError(null);
            try {
              const blob = await api.exportExcel(token);
              downloadBlob(blob, "issues.xlsx");
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Export failed");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "excel" ? "Exporting…" : "Download Excel"}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={!!busy}
          onClick={async () => {
            if (!token) return;
            setBusy("pdf");
            setError(null);
            try {
              const blob = await api.exportPdf(token);
              downloadBlob(blob, "issues.pdf");
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : "Export failed");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "pdf" ? "Exporting…" : "Download PDF"}
        </button>
      </div>
    </section>
  );
}
