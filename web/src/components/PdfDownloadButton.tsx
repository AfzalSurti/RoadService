import { useState, type MouseEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

/** Downloads a server-generated PDF (e.g. `/api/v1/issues/12/pdf`) with the user's token. */
export function PdfDownloadButton({
  path,
  filename,
  label = "Download PDF",
  className = "btn ghost",
}: {
  path: string;
  filename: string;
  label?: string;
  className?: string;
}) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!token || busy) return;
    setBusy(true);
    try {
      const blob = await api.downloadPdf(token, path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "PDF download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={onClick} disabled={busy}>
      {busy ? "Preparing…" : label}
    </button>
  );
}
