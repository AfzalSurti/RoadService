/** Invoice and recommendation details of a vendor bill (same columns as the payment register). */
export type BillDetails = {
  invoice_no?: string;
  invoice_date?: string;
  submission_date?: string;
  payment_type?: string;
  invoice_amount?: string;
  bill_from?: string;
  bill_to?: string;
  recommended_gmc?: string;
  recommended_nhipmpl?: string;
  net_released?: string;
  voucher_no?: string;
  status?: string;
  remarks?: string;
};

export const PAYMENT_TYPES = [
  "Stage Payment Statement for Works",
  "IPC (Interim Payment Certificate)",
  "Running Account (RA) Bill",
  "Final Bill",
  "Advance",
];

export const BILL_STATUSES = [
  "Submitted",
  "Under scrutiny by GMC",
  "Recommended by GMC",
  "Recommended by NHIPMPL",
  "Clarification sought",
  "Payment released",
];

export const BILL_DETAIL_LABELS: [keyof BillDetails, string][] = [
  ["status", "Current status"],
  ["invoice_no", "Invoice No."],
  ["invoice_date", "Invoice Date"],
  ["invoice_amount", "Invoice Amount ₹"],
  ["submission_date", "Submission Date"],
  ["bill_from", "Bill Duration From"],
  ["bill_to", "Bill Duration To"],
  ["payment_type", "Payment Type"],
  ["recommended_gmc", "Recommended by GMC Team ₹"],
  ["recommended_nhipmpl", "Recommended by NHIPMPL ₹"],
  ["net_released", "Net Amount Released ₹"],
  ["voucher_no", "Voucher No."],
  ["remarks", "Remarks"],
];

export const hasDetails = (d?: BillDetails | null) => !!d && Object.values(d).some((v) => String(v ?? "").trim());

/** Form fields: bill (invoice) details, then recommendation and release details. */
export function BillDetailsFields({ value, onChange }: { value: BillDetails; onChange: (v: BillDetails) => void }) {
  const set = (k: keyof BillDetails, v: string) => onChange({ ...value, [k]: v });
  const text = (k: keyof BillDetails, label: string, type = "text", extra: Record<string, string> = {}) => (
    <label>
      {label}
      <input type={type} value={value[k] || ""} onChange={(e) => set(k, e.target.value)} {...extra} />
    </label>
  );
  return (
    <>
      <h3 className="bill-detail-head">Bill details</h3>
      <div className="form-grid">
        {text("invoice_no", "Invoice No.")}
        {text("invoice_date", "Invoice Date", "date")}
        {text("invoice_amount", "Invoice Amount (₹)", "number", { step: "0.01", min: "0" })}
        {text("submission_date", "Invoice Submission Date", "date")}
        {text("bill_from", "Bill Duration From", "date")}
        {text("bill_to", "Bill Duration To", "date")}
        <label>
          Payment Type
          <select value={value.payment_type || ""} onChange={(e) => set("payment_type", e.target.value)}>
            <option value="">Select…</option>
            {PAYMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Current status
          <select value={value.status || ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">Select…</option>
            {BILL_STATUSES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <h3 className="bill-detail-head">Recommendation details</h3>
      <div className="form-grid">
        {text("recommended_gmc", "Recommendation by GMC Team (₹)", "number", { step: "0.01", min: "0" })}
        {text("recommended_nhipmpl", "Recommendation by NHIPMPL (₹)", "number", { step: "0.01", min: "0" })}
        {text("net_released", "Net Amount Released (₹)", "number", { step: "0.01", min: "0" })}
        {text("voucher_no", "Voucher No.")}
        <label className="span-2">
          Remarks
          <input value={value.remarks || ""} onChange={(e) => set("remarks", e.target.value)} />
        </label>
      </div>
    </>
  );
}
