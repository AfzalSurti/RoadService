import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { TOLL_CLASSES, parseTariff } from "../pages/NhitPages";

type Row = Record<string, unknown>;

/**
 * Project Inventory · ATMS / TMS: the package's toll plazas (TMS: lanes, ETC, WIM, tariff by
 * vehicle class) and its ATMS / TMS field devices. Edited on Toll Operations; shown here so the
 * package inventory is complete.
 */
export function TmsInventory({ projectId }: { projectId: number }) {
  const { token } = useAuth();
  const [plazas, setPlazas] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);

  useEffect(() => {
    if (!token) return;
    api.nhitGet<Row[]>(token, "/toll/plazas").then(setPlazas).catch(() => setPlazas([]));
    api.nhitGet<Row[]>(token, "/its").then(setDevices).catch(() => setDevices([]));
  }, [token]);

  const mine = (r: Row) => r.project_id == null || Number(r.project_id) === projectId;
  const pkgPlazas = plazas.filter(mine);
  const pkgDevices = devices.filter(
    (d) => mine(d) && ["atms", "tms", "mlff"].includes(String(d.system_type || "").toLowerCase())
  );

  return (
    <section className="panel">
      <h2>ATMS / TMS inventory</h2>
      <h3>TMS · toll plazas</h3>
      {pkgPlazas.length ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Plaza</th>
                <th>Chainage</th>
                <th>Lanes</th>
                <th>ETC</th>
                <th>WIM</th>
                {TOLL_CLASSES.map((c) => (
                  <th key={c}>{c} ₹</th>
                ))}
                <th>Tariff revised</th>
              </tr>
            </thead>
            <tbody>
              {pkgPlazas.map((p) => {
                const t = parseTariff(p.tariff_notes);
                return (
                  <tr key={String(p.id)}>
                    <td>{String(p.name)}</td>
                    <td>{String(p.chainage || "—")}</td>
                    <td>{String(p.lanes ?? "—")}</td>
                    <td>{p.has_etc ? "Yes" : "No"}</td>
                    <td>{p.has_wim ? "Yes" : "No"}</td>
                    {t ? (
                      TOLL_CLASSES.map((c) => <td key={c}>{t[c] || "—"}</td>)
                    ) : (
                      <td colSpan={TOLL_CLASSES.length}>{String(p.tariff_notes || "—")}</td>
                    )}
                    <td>{String(p.revision_date || "—")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No toll plazas recorded for this package (add them on Toll Operations).</p>
      )}

      <h3>ATMS / TMS devices</h3>
      {pkgDevices.length ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>System</th>
                <th>Device</th>
                <th>Location</th>
                <th>Status</th>
                <th>Health %</th>
                <th>Firmware</th>
              </tr>
            </thead>
            <tbody>
              {pkgDevices.map((d) => (
                <tr key={String(d.id)}>
                  <td>{String(d.system_type || "").toUpperCase()}</td>
                  <td>{String(d.name)}</td>
                  <td>{String(d.location || "—")}</td>
                  <td>{String(d.status || "—")}</td>
                  <td>{d.health_pct == null ? "—" : Number(d.health_pct).toFixed(0)}</td>
                  <td>{String(d.firmware_version || "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No ATMS / TMS devices recorded for this package.</p>
      )}
    </section>
  );
}
