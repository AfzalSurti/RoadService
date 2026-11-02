import { useEffect, useState } from "react";
import { api, mediaUrl } from "../api";
import { useAuth } from "../auth";
import { VENDOR_DOC_TYPES } from "../lib/workCategories";
import type { Vendor, VendorDocument } from "../types";

/**
 * Vendor "View details": documents grouped by type (Work Order, LOA, BOQ, EOT,
 * Bills), each opening in a new tab. GMC Experts can add files or remove them.
 */
export function VendorDocumentsModal({ vendor, onClose }: { vendor: Vendor; onClose: () => void }) {
  const { token, role, isReadonly } = useAuth();
  const canManage = role === "admin" && !isReadonly;
  const [docs, setDocs] = useState<VendorDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    api
      .vendorDocuments(token, vendor.id)
      .then((d) => {
        setDocs(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, [token, vendor.id]);

  const upload = async (docType: string, files: FileList | null) => {
    if (!token || !files?.length) return;
    setBusyType(docType);
    try {
      await api.uploadVendorDocuments(token, vendor.id, docType, Array.from(files));
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyType(null);
    }
  };

  const remove = async (doc: VendorDocument) => {
    if (!token || !window.confirm(`Remove “${doc.file_name || "this file"}”?`)) return;
    try {
      await api.deleteVendorDocument(token, vendor.id, doc.id);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Remove failed");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card vendor-docs" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head-row">
          <h2>{vendor.name} · Documents</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {!docs && !error ? <p className="muted">Loading documents…</p> : null}
        {docs ? (
          <div className="vendor-docs-groups">
            {VENDOR_DOC_TYPES.map((t) => {
              const files = docs.filter((d) => d.doc_type === t.key);
              return (
                <section key={t.key} className="vendor-docs-group">
                  <h3>
                    {t.label} <span className="works-tab-count">{files.length}</span>
                  </h3>
                  {files.length ? (
                    <ul>
                      {files.map((d, i) => (
                        <li key={d.id}>
                          <a href={mediaUrl(d.file_path)} target="_blank" rel="noreferrer">
                            {d.file_name || `${t.label} ${i + 1}`}
                          </a>
                          <small className="muted"> · {new Date(d.created_at).toLocaleDateString()}</small>
                          {canManage ? (
                            <button type="button" className="linkish vendor-docs-remove" onClick={() => remove(d)}>
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No files yet.</p>
                  )}
                  {canManage ? (
                    <label className="vendor-docs-add">
                      {busyType === t.key ? "Uploading…" : "+ Add files"}
                      <input
                        type="file"
                        multiple
                        disabled={busyType !== null}
                        onChange={(e) => {
                          void upload(t.key, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
