import type { Vendor } from "../types";

/** Work categories a vendor is listed under (stored in vendor.type_of_work). */
export const WORK_CATEGORIES = [
  { key: "schedule_b", label: "Schedule B Works" },
  { key: "routine_maintenance", label: "Routine Maintenance Work" },
  { key: "item_wise_civil", label: "Particular Item Wise Civil Works" },
  { key: "atms_tms", label: "ATMS & TMS Work Related" },
] as const;

export type WorkCategoryKey = (typeof WORK_CATEGORIES)[number]["key"];

/**
 * Map a vendor's type of work to a category. Exact labels match directly; older
 * free-text values ("ATMS", "routine", "civil items"…) are matched by keyword.
 */
export function vendorCategory(v: Pick<Vendor, "type_of_work">): WorkCategoryKey | null {
  const t = (v.type_of_work || "").trim().toLowerCase();
  if (!t) return null;
  const exact = WORK_CATEGORIES.find((c) => c.label.toLowerCase() === t);
  if (exact) return exact.key;
  if (t.includes("schedule")) return "schedule_b";
  if (t.includes("routine") || t.includes("maintenance")) return "routine_maintenance";
  if (t.includes("atms") || t.includes("tms") || t.includes("toll") || t.includes("its")) return "atms_tms";
  if (t.includes("item") || t.includes("civil")) return "item_wise_civil";
  return null;
}

/** Time limit / DLP are stored as a number of days; older free text is shown as-is. */
export function formatDays(value: string | null | undefined): string {
  const v = (value || "").trim();
  if (!v) return "—";
  return /^\d+$/.test(v) ? `${v} ${v === "1" ? "day" : "days"}` : v;
}

/** Value for a days input: digits only ("12 days" → "12"); non-day text → "". */
export function daysInputValue(value: string | null | undefined): string {
  const m = (value || "").trim().match(/^(\d+)\s*(days?)?$/i);
  return m ? m[1] : "";
}
