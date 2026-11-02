import { FormEvent, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { RateItem, Vendor } from "../types";

function money(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const remainingQty = (i: RateItem) => Math.max(Number(i.boq_quantity) - Number(i.executed_quantity), 0);

/**
 * Add a vendor bill (RA bill): bill no + date, and this bill's quantity for each of
 * the vendor's BOQ items (never more than what is remaining).
 */
export function BoqBillModal({
  projectId,
  vendor,
  items,
  suggestedBillNo,
  focusItemId,
  onClose,
  onSaved,
}: {
  projectId: number;
  vendor: Vendor;
  items: RateItem[];
  suggestedBillNo: string;
  focusItemId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [billNo, setBillNo] = useState(suggestedBillNo);
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = items.filter((i) => remainingQty(i) > 0);
  const lines = useMemo(
    () =>
      open
        .map((i) => ({ item: i, q: Number(qty[i.id]) || 0 }))
        .filter((l) => l.q > 0),
    [open, qty]
  );
  const billAmount = lines.reduce((s, l) => s + l.q * Number(l.item.rate), 0);
  const totalBoq = items.reduce((s, i) => s + Number(i.boq_amount), 0);
  const doneBefore = items.reduce((s, i) => s + Number(i.executed_amount), 0);
  const over = lines.find((l) => l.q > remainingQty(l.item));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!billNo.trim()) return setError("Enter the bill number");
    if (!lines.length) return setError("Enter this bill's quantity for at least one BOQ item");
    if (over) return setError(`BOQ item ${over.item.item_no}: only ${remainingQty(over.item)} ${over.item.unit} remaining`);
    setBusy(true);
    setError(null);
    try {
      await api.createVendorBill(token, {
        project_id: projectId,
        vendor_id: vendor.id,
        bill_no: billNo.trim(),
        bill_date: billDate,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({ rate_item_id: l.item.id, quantity: l.q })),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bill could not be saved");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card boq-bill-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add bill · {vendor.name}</h2>
        <p className="muted">
          Enter the quantity completed in this bill for each item. Amount = quantity × rate; the remaining amount
          goes down by this bill.
        </p>
        {error ? <div className="error">{error}</div> : null}
        <div className="form-grid">
          <label>
            Bill no.
            <input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. RA Bill 2" />
          </label>
          <label>
            Bill date
            <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </label>
          <label className="span-2">
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        {open.length ? (
          <div className="table-scroll">
            <table className="data boq-bill-table">
              <thead>
                <tr>
                  <th>BOQ item</th>
                  <th>Unit</th>
                  <th>Rate ₹</th>
                  <th>Remaining qty</th>
                  <th>This bill qty</th>
                  <th>Amount ₹</th>
                </tr>
              </thead>
              <tbody>
                {open.map((i) => {
                  const q = Number(qty[i.id]) || 0;
                  const tooMuch = q > remainingQty(i);
                  return (
                    <tr key={i.id} className={focusItemId === i.id ? "row-active" : undefined}>
                      <td>
                        <strong>{i.item_no}</strong>
                        <div className="muted works-brief">{i.description}</div>
                      </td>
                      <td>{i.unit}</td>
                      <td>{money(Number(i.rate))}</td>
                      <td>{remainingQty(i)}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          max={remainingQty(i)}
                          autoFocus={focusItemId === i.id}
                          aria-invalid={tooMuch}
                          value={qty[i.id] ?? ""}
                          onChange={(e) => setQty((cur) => ({ ...cur, [i.id]: e.target.value }))}
                        />
                        {tooMuch ? <small className="field-error">Max {remainingQty(i)}</small> : null}
                      </td>
                      <td className="boq-done">{q ? money(q * Number(i.rate)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Every BOQ item of this vendor is fully completed — nothing remains to bill.</p>
        )}

        <div className="boq-form-summary">
          <span>
            Total BOQ <strong>₹ {money(totalBoq)}</strong>
          </span>
          <span>
            Billed so far <strong>₹ {money(doneBefore)}</strong>
          </span>
          <span>
            This bill <strong className="boq-done">₹ {money(billAmount)}</strong>
          </span>
          <span>
            Remaining after bill <strong className="boq-remaining">₹ {money(Math.max(totalBoq - doneBefore - billAmount, 0))}</strong>
          </span>
        </div>

        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button className="btn" type="submit" disabled={busy || !open.length}>
            {busy ? "Saving…" : "Save bill"}
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
