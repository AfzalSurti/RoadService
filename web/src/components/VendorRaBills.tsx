import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { usePackageScope } from "../lib/projectScope";
import type { Project, Vendor, VendorBill } from "../types";
import { RaBillModal } from "./RaBillModal";

const inr = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Vendor RA bills of a package, each opening in the proforma-invoice (RA bill) format. */
export function VendorRaBills() {
  const { token } = useAuth();
  const { inScope } = usePackageScope();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [open, setOpen] = useState<{ vendorId: number; billNo: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api.projects(token).then(setProjects).catch(() => setProjects([]));
    api.vendors(token).then(setVendors).catch(() => setVendors([]));
  }, [token]);
  const shown = useMemo(() => projects.filter((p) => inScope(p.id)), [projects, inScope]);
  useEffect(() => {
    if (shown.length && !shown.some((p) => p.id === projectId)) setProjectId(shown[0].id);
  }, [shown]);
  useEffect(() => {
    if (!token || !projectId) return;
    api.vendorBills(token, projectId).then(setBills).catch(() => setBills([]));
  }, [token, projectId]);

  const vendorName = (id: number | null) => vendors.find((v) => v.id === id)?.name || "—";
  const active = bills.filter((b) => b.status !== "cancelled" && b.vendor_id != null);

  return (
    <section className="panel">
      <div className="overview-head">
        <h2 style={{ marginTop: 0 }}>Vendor RA bills</h2>
        <label>
          Package
          <select value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value))}>
            {shown.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        RA bills recorded on the BOQ, shown in the proforma-invoice format (invoice summary and abstract sheet) — print or
        export from the bill.
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Vendor</th>
              <th>Bill date</th>
              <th>BOQ items</th>
              <th>Gross amount ₹</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {active.map((b) => (
              <tr key={`${b.vendor_id}-${b.bill_no}`}>
                <td>{b.bill_no}</td>
                <td>{vendorName(b.vendor_id)}</td>
                <td>{b.bill_date || "—"}</td>
                <td>{b.lines.length}</td>
                <td>{inr(b.total_amount)}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setOpen({ vendorId: b.vendor_id as number, billNo: b.bill_no })}
                  >
                    View RA bill
                  </button>
                </td>
              </tr>
            ))}
            {!active.length ? (
              <tr>
                <td colSpan={6} className="muted">
                  No vendor bills recorded for this package yet (record them on BOQ → + Add bill).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {open && projectId ? (
        <RaBillModal projectId={projectId} vendorId={open.vendorId} billNo={open.billNo} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
