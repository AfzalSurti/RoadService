import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type RaLine = {
  item_no: string;
  description: string;
  unit: string;
  wo_qty: number;
  rate: number;
  wo_amount: number;
  qty_upto: number;
  qty_prev: number;
  qty_this: number;
  amt_upto: number;
  amt_prev: number;
  amt_this: number;
};
type RaBill = {
  project: { id: number; name: string; title?: string | null };
  vendor: { id: number; name: string; work_order_no: string; work_description: string; address?: string | null; gst_no?: string | null };
  bill_no: string;
  invoice_no: string;
  bill_date: string | null;
  period_from: string | null;
  period_to: string | null;
  lines: RaLine[];
};

type Employer = { name: string; address: string; gst: string };
const EMPLOYER_DEFAULT: Employer = { name: "NHIT Eastern Projects Private Limited", address: "", gst: "" };

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const dmy = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "—");

/**
 * RA bill in the proforma-invoice format used on site (RA Bill Performa Invoice): the invoice
 * summary (A-K, up to date / previous / this bill) and the abstract sheet, worked out from the
 * vendor's BOQ items and bills. Print / PDF and Export to Excel.
 */
export function RaBillModal({
  projectId,
  vendorId,
  billNo,
  onClose,
}: {
  projectId: number;
  vendorId: number;
  billNo: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [bill, setBill] = useState<RaBill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gstMode, setGstMode] = useState<"igst" | "cgst">("igst");
  const [rates, setRates] = useState({ retention: 6, it: 1, cess: 1, sop: 75 });
  const empKey = `roadservice.employer.${projectId}`;
  const [employer, setEmployer] = useState<Employer>(() => {
    try {
      return { ...EMPLOYER_DEFAULT, ...(JSON.parse(localStorage.getItem(empKey) || "{}") as Partial<Employer>) };
    } catch {
      return EMPLOYER_DEFAULT;
    }
  });
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .raBill(token, projectId, vendorId, billNo)
      .then((b) => setBill(b as RaBill))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load the bill"));
  }, [token, projectId, vendorId, billNo]);

  useEffect(() => {
    try {
      localStorage.setItem(empKey, JSON.stringify(employer));
    } catch {
      /* private mode */
    }
  }, [employer]);

  const calc = useMemo(() => {
    if (!bill) return null;
    const col = (k: "upto" | "prev" | "this") => {
      const gross = bill.lines.reduce((a, l) => a + (k === "upto" ? l.amt_upto : k === "prev" ? l.amt_prev : l.amt_this), 0);
      const sgst = gstMode === "cgst" ? gross * 0.09 : 0;
      const cgst = gstMode === "cgst" ? gross * 0.09 : 0;
      const igst = gstMode === "igst" ? gross * 0.18 : 0;
      const totalGross = gross + sgst + cgst + igst;
      const retention = (gross * rates.retention) / 100;
      const totalDeduction = retention;
      const it = (gross * rates.it) / 100;
      const cess = (gross * rates.cess) / 100;
      const tds = it + cess;
      const net = Math.round(totalGross - 0 - totalDeduction + 0 - tds);
      return { gross, sgst, cgst, igst, totalGross, retention, totalDeduction, it, cess, tds, net };
    };
    const upto = col("upto");
    const prev = col("prev");
    const thisBill = col("this");
    // As in the sheet: SOP this bill = 75 % of this bill's net; previous = previous net; up to date = sum.
    const sopThis = Math.round((thisBill.net * rates.sop) / 100);
    const sop = { upto: prev.net + sopThis, prev: prev.net, this: sopThis };
    const woTotal = bill.lines.reduce((a, l) => a + l.wo_amount, 0);
    return { upto, prev, thisBill, sop, woTotal };
  }, [bill, gstMode, rates]);

  const printIt = () => {
    if (!sheet.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>RA Bill ${bill?.bill_no || ""} - ${bill?.vendor.name || ""}</title>
      <style>body{font-family:Calibri,Arial,sans-serif;padding:18px;color:#111}table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th,td{border:1px solid #444;padding:4px 6px;font-size:11.5px;vertical-align:top}th{background:#d9e1f2}
      .num{text-align:right;white-space:nowrap}.ra-bold td{font-weight:700}.ra-head td{background:#fff2cc;font-weight:700}
      .ra-title{text-align:center;font-weight:700;font-size:14px}.ra-sub{text-align:center}.no-print,input,select{display:none}
      .ra-sheet{page-break-after:always}.ra-sheet:last-child{page-break-after:auto}</style></head><body>${sheet.current.innerHTML}
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  const exportCsv = () => {
    if (!bill || !calc) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const L: unknown[][] = [
      ["Project Name", bill.project.title || bill.project.name],
      ["Work Description", bill.vendor.work_description],
      ["Vendor", bill.vendor.name, "Work Order No.", bill.vendor.work_order_no, "GST", bill.vendor.gst_no || ""],
      ["Bill Period", `${dmy(bill.period_from)} to ${dmy(bill.period_to)}`, "Invoice No.", bill.invoice_no, "Invoice Date", dmy(bill.bill_date)],
      [],
      ["S.No.", "Description", "Up to Date Amount", "Previous Bill Amount", "This Bill Amount"],
      ...summaryRows(calc, gstMode, rates).map((r) => [r[0], r[1], ...r.slice(2).map((v) => (typeof v === "number" ? v.toFixed(2) : v))]),
      [],
      ["ABSTRACT SHEET"],
      ["S.no.", "Description", "Unit", "WO Qty", "Rate", "WO Amount", "Qty Upto date", "Qty Previous", "Qty This Bill", "Amount Upto date", "Amount Previous", "Amount This Bill"],
      ...bill.lines.map((l, i) => [i + 1, l.description, l.unit, l.wo_qty, l.rate, l.wo_amount.toFixed(2), l.qty_upto, l.qty_prev, l.qty_this, l.amt_upto.toFixed(2), l.amt_prev.toFixed(2), l.amt_this.toFixed(2)]),
      ["", "Total Amount - A", "", "", "", calc.woTotal.toFixed(2), "", "", "", calc.upto.gross.toFixed(2), calc.prev.gross.toFixed(2), calc.thisBill.gross.toFixed(2)],
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + L.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `RA_${bill.bill_no.replace(/\W+/g, "_")}_${bill.vendor.name.replace(/\W+/g, "_")}.csv`;
    a.click();
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer ra-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head-row">
          <h2 style={{ margin: 0 }}>RA Bill · {billNo}</h2>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={printIt} disabled={!bill}>
              Print / PDF
            </button>
            <button className="btn ghost" type="button" onClick={exportCsv} disabled={!bill}>
              Export to Excel
            </button>
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {error ? <div className="error">{error}</div> : null}
        {!bill && !error ? <p className="muted">Loading…</p> : null}
        {bill && calc ? (
          <>
            <div className="ra-settings no-print">
              <label>
                GST
                <select value={gstMode} onChange={(e) => setGstMode(e.target.value as "igst" | "cgst")}>
                  <option value="igst">IGST 18%</option>
                  <option value="cgst">SGST 9% + CGST 9%</option>
                </select>
              </label>
              {(
                [
                  ["retention", "Retention %"],
                  ["it", "Income tax %"],
                  ["cess", "Labour cess %"],
                  ["sop", "SOP by GMC %"],
                ] as const
              ).map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    inputMode="decimal"
                    value={String(rates[k])}
                    onChange={(e) => setRates({ ...rates, [k]: Number(e.target.value || 0) })}
                  />
                </label>
              ))}
              <label>
                Employer
                <input value={employer.name} onChange={(e) => setEmployer({ ...employer, name: e.target.value })} />
              </label>
              <label>
                Employer address
                <input value={employer.address} onChange={(e) => setEmployer({ ...employer, address: e.target.value })} />
              </label>
              <label>
                Employer GST
                <input value={employer.gst} onChange={(e) => setEmployer({ ...employer, gst: e.target.value })} />
              </label>
            </div>

            <div ref={sheet}>
              <div className="ra-sheet">
                <table className="ra-table" data-nofilter>
                  <tbody>
                    <tr>
                      <td colSpan={5} className="ra-title">
                        Project Name- {bill.project.title || bill.project.name}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="ra-sub">
                        {bill.project.name}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5}>
                        <b>Work Description :-</b> {bill.vendor.work_description || "—"}
                      </td>
                    </tr>
                    <tr className="ra-head">
                      <td colSpan={2}>Vendor Details:-</td>
                      <td colSpan={3}>Employer Details:-</td>
                    </tr>
                    <tr>
                      <td>Name:-</td>
                      <td>{bill.vendor.name}</td>
                      <td>Name:-</td>
                      <td colSpan={2}>{employer.name}</td>
                    </tr>
                    <tr>
                      <td>Work Order No.</td>
                      <td>{bill.vendor.work_order_no || "—"}</td>
                      <td>Address:-</td>
                      <td colSpan={2}>{employer.address || "—"}</td>
                    </tr>
                    <tr>
                      <td>Address:-</td>
                      <td>{bill.vendor.address || "—"}</td>
                      <td>GST Nos:-</td>
                      <td colSpan={2}>{employer.gst || "—"}</td>
                    </tr>
                    <tr>
                      <td>GST Nos:-</td>
                      <td>{bill.vendor.gst_no || "—"}</td>
                      <td colSpan={3}></td>
                    </tr>
                    <tr>
                      <td>Bill Period:-</td>
                      <td colSpan={4}>
                        {dmy(bill.period_from)} to {dmy(bill.period_to)}
                      </td>
                    </tr>
                    <tr>
                      <td>Invoice No.:-</td>
                      <td colSpan={4}>{bill.invoice_no}</td>
                    </tr>
                    <tr>
                      <td>Invoice Date:-</td>
                      <td colSpan={4}>{dmy(bill.bill_date)}</td>
                    </tr>
                  </tbody>
                </table>
                <table className="ra-table" data-nofilter>
                  <thead>
                    <tr>
                      <th>S.No.</th>
                      <th>Description</th>
                      <th>Up to Date Amount</th>
                      <th>Previous Bill Amount</th>
                      <th>This Bill Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows(calc, gstMode, rates).map((r, i) => (
                      <tr key={i} className={/^[A-K]$/.test(String(r[0])) ? "ra-bold" : undefined}>
                        <td>{r[0]}</td>
                        <td>{r[1]}</td>
                        {r.slice(2).map((v, j) => (
                          <td key={j} className="num">
                            {typeof v === "number" ? inr(v) : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ra-sheet">
                <table className="ra-table" data-nofilter>
                  <tbody>
                    <tr>
                      <td className="ra-title">{employer.name}</td>
                    </tr>
                    <tr>
                      <td className="ra-sub">Project:- {bill.project.name}</td>
                    </tr>
                    <tr>
                      <td>Reg.- {bill.vendor.work_description || "—"}</td>
                    </tr>
                    <tr>
                      <td>Vendor Name :- {bill.vendor.name}</td>
                    </tr>
                    <tr>
                      <td>Work Order Number: {bill.vendor.work_order_no || "—"}</td>
                    </tr>
                    <tr>
                      <td>
                        Bill Period: - {dmy(bill.period_from)} to {dmy(bill.period_to)}
                      </td>
                    </tr>
                    <tr>
                      <td>Bill No. : {bill.invoice_no.padStart(2, "0")}</td>
                    </tr>
                    <tr className="ra-head">
                      <td className="ra-title">ABSTRACT SHEET</td>
                    </tr>
                  </tbody>
                </table>
                <table className="ra-table" data-nofilter>
                  <thead>
                    <tr>
                      <th rowSpan={2}>S.no.</th>
                      <th rowSpan={2}>Description</th>
                      <th colSpan={4}>Work Order</th>
                      <th colSpan={3}>Quantity</th>
                      <th colSpan={3}>Amount (Rs.)</th>
                    </tr>
                    <tr>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Rate (Rs.)</th>
                      <th>Amount (Rs.)</th>
                      <th>Upto date</th>
                      <th>Previous</th>
                      <th>This Bill</th>
                      <th>Upto date</th>
                      <th>Previous</th>
                      <th>This Bill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{l.description}</td>
                        <td>{l.unit}</td>
                        <td className="num">{qty(l.wo_qty)}</td>
                        <td className="num">{inr(l.rate)}</td>
                        <td className="num">{inr(l.wo_amount)}</td>
                        <td className="num">{qty(l.qty_upto)}</td>
                        <td className="num">{qty(l.qty_prev)}</td>
                        <td className="num">{qty(l.qty_this)}</td>
                        <td className="num">{inr(l.amt_upto)}</td>
                        <td className="num">{inr(l.amt_prev)}</td>
                        <td className="num">{inr(l.amt_this)}</td>
                      </tr>
                    ))}
                    <tr className="ra-bold">
                      <td colSpan={5}>Total Amount -A</td>
                      <td className="num">{inr(calc.woTotal)}</td>
                      <td colSpan={3}></td>
                      <td className="num">{inr(calc.upto.gross)}</td>
                      <td className="num">{inr(calc.prev.gross)}</td>
                      <td className="num">{inr(calc.thisBill.gross)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p className="muted no-print">
              Quantities come from the vendor&apos;s BOQ items and bills in RoadService. Percentages and employer details can be
              adjusted above before printing.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Col = { gross: number; sgst: number; cgst: number; igst: number; totalGross: number; retention: number; totalDeduction: number; it: number; cess: number; tds: number; net: number };

function summaryRows(
  calc: { upto: Col; prev: Col; thisBill: Col; sop: { upto: number; prev: number; this: number } },
  gstMode: "igst" | "cgst",
  rates: { retention: number; it: number; cess: number; sop: number }
): (string | number)[][] {
  const three = (f: (c: Col) => number) => [f(calc.upto), f(calc.prev), f(calc.thisBill)];
  const dash = ["-", "-", "-"];
  return [
    ["A", "Work Done", "", "", ""],
    ["(i)", "Gross Value of Work Done", ...three((c) => c.gross)],
    ["(ii)", "SGST @ 9% of (i)", ...(gstMode === "cgst" ? three((c) => c.sgst) : dash)],
    ["(iii)", "CGST @ 9% of (i)", ...(gstMode === "cgst" ? three((c) => c.cgst) : dash)],
    ["(iv)", "IGST @ 18% of (i)", ...(gstMode === "igst" ? three((c) => c.igst) : dash)],
    ["B", "Total Gross Amount:- (i+ii+iii+iv)", ...three((c) => c.totalGross)],
    ["C", "Advance", "", "", ""],
    ["(i)", "Advance recovery", ...dash],
    ["D", "Deduction/Withheld Amount", "", "", ""],
    ["(i)", `Retention Money ${rates.retention}%`, ...three((c) => c.retention)],
    ["(ii)", "Withheld for Non-submission of PBG", ...dash],
    ["(iii)", "Hold for HR Compliance", ...dash],
    ["(iv)", "Hold for Safety Compliance", ...dash],
    ["(v)", "Withheld GST (ii+iii+iv)", ...dash],
    ["(vi)", "Withheld for Non-submission of RFI to GMC @ 10% on A(i)", ...dash],
    ["E", "Total Deduction:-(i+ii+iii+iv+v+vi)", ...three((c) => c.totalDeduction)],
    ["F", "Released Amount", "", "", ""],
    ["(i)", `Retention Money @ ${rates.retention}%`, ...dash],
    ["(ii)", "Released Submission of PBG", ...dash],
    ["(iii)", "Released for HR Compliance", ...dash],
    ["(iv)", "Released for Safety Compliance", ...dash],
    ["(v)", "GST Released", ...dash],
    ["(vi)", "Released if Any", ...dash],
    ["G", "Total Released:-(i+ii+iii+iv+v+vi)", ...dash],
    ["H", "Deduction-", "", "", ""],
    ["(i)", `Income Tax @ ${rates.it}%`, ...three((c) => c.it)],
    ["(ii)", `Labour Cess @ ${rates.cess}%`, ...three((c) => c.cess)],
    ["(iii)", "Liquid damage", ...dash],
    ["I", "Total Deduction:-(i+ii+iii)", ...three((c) => c.tds)],
    ["J", "Net Payable Amount= (B-C-E+G-I)", ...three((c) => c.net)],
    ["K", `SOP By GMC ${rates.sop} % on (J)`, calc.sop.upto, calc.sop.prev, calc.sop.this],
  ];
}
