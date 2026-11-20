import { useEffect } from "react";

/**
 * Adds a filter bar above every data table in the portal: a text search plus a
 * drop-down for each column that holds a short list of values (Package, Status,
 * Work tab, Type ...). Rows are filtered in the browser, so it works on every
 * page without each page wiring its own filters. Add data-nofilter to a table
 * to opt out.
 */
const SKIP = "table.boq-bill-table, table[data-nofilter]";
const MIN_ROWS = 1;
const MAX_CHOICES = 25;

type Bar = {
  el: HTMLDivElement;
  search: HTMLInputElement;
  selects: Map<number, HTMLSelectElement>;
  count: HTMLSpanElement;
  signature: string;
};

const bars = new WeakMap<HTMLTableElement, Bar>();
const live = new Set<HTMLTableElement>();

function cellText(td: Element | undefined) {
  return (td?.textContent || "").replace(/\s+/g, " ").trim();
}

function dataRows(table: HTMLTableElement) {
  const body = table.tBodies[0];
  if (!body) return [] as HTMLTableRowElement[];
  // Skip "No records" placeholder rows (a single cell spanning the table).
  return Array.from(body.rows).filter((r) => !(r.cells.length === 1 && r.cells[0].colSpan > 1));
}

function headers(table: HTMLTableElement) {
  const head = table.tHead?.rows[0];
  return head ? Array.from(head.cells).map((c) => cellText(c)) : [];
}

/** Download the visible rows (after filters) as CSV that Excel opens directly. */
function exportCsv(table: HTMLTableElement) {
  const heads = headers(table);
  const keep = heads.map((h, i) => (h && !/^(actions?|pdf|quick action)$/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [keep.map((i) => esc(heads[i])).join(",")];
  for (const r of dataRows(table)) {
    if (r.hidden) continue;
    lines.push(keep.map((i) => esc(cellText(r.cells[i]))).join(","));
  }
  const title =
    (table.closest("section, .panel, main")?.querySelector("h2, h3")?.textContent || document.title || "table")
      .trim()
      .replace(/[^\w\- ]+/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "table";
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function apply(table: HTMLTableElement, bar: Bar) {
  const q = bar.search.value.trim().toLowerCase();
  const rows = dataRows(table);
  let shown = 0;
  for (const r of rows) {
    let ok = !q || (r.textContent || "").toLowerCase().includes(q);
    if (ok) {
      for (const [col, sel] of bar.selects) {
        if (sel.value && cellText(r.cells[col]) !== sel.value) {
          ok = false;
          break;
        }
      }
    }
    r.hidden = !ok;
    if (ok) shown += 1;
  }
  const active = !!q || Array.from(bar.selects.values()).some((s) => s.value);
  bar.count.textContent = active ? `Showing ${shown} of ${rows.length}` : `${rows.length} rows`;
}

function build(table: HTMLTableElement, bar: Bar | undefined) {
  const rows = dataRows(table);
  const heads = headers(table);
  // Columns worth a drop-down: few distinct values, repeated across rows.
  const choices = new Map<number, string[]>();
  heads.forEach((h, col) => {
    if (!h || /actions?$/i.test(h)) return;
    const vals = new Set<string>();
    for (const r of rows) {
      const t = cellText(r.cells[col]);
      if (t && t !== "—") vals.add(t);
      if (vals.size > MAX_CHOICES) return;
    }
    if (vals.size >= 2 && vals.size < rows.length && vals.size <= MAX_CHOICES) {
      choices.set(col, Array.from(vals).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    }
  });
  const signature = JSON.stringify([heads, Array.from(choices.entries())]);

  if (!bar) {
    const el = document.createElement("div");
    el.className = "auto-filter";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filter rows…";
    search.setAttribute("aria-label", "Filter table rows");
    const count = document.createElement("span");
    count.className = "auto-filter-count";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "linkish";
    clear.textContent = "Clear";
    const exp = document.createElement("button");
    exp.type = "button";
    exp.className = "btn ghost auto-filter-export";
    exp.textContent = "Export to Excel";
    exp.title = "Download the rows shown as a CSV file (opens in Excel)";
    exp.addEventListener("click", () => exportCsv(table));
    el.append(search);
    const holder = document.createElement("span");
    holder.className = "auto-filter-selects";
    el.append(holder, clear, count, exp);
    bar = { el, search, selects: new Map(), count, signature: "" };
    const b = bar;
    search.addEventListener("input", () => apply(table, b));
    clear.addEventListener("click", () => {
      b.search.value = "";
      b.selects.forEach((s) => (s.value = ""));
      apply(table, b);
    });
    const anchor = table.closest(".table-scroll") || table;
    anchor.parentElement?.insertBefore(el, anchor);
    bars.set(table, bar);
    live.add(table);
  }

  if (bar.signature !== signature) {
    const holder = bar.el.querySelector(".auto-filter-selects")!;
    const prev = new Map(Array.from(bar.selects.entries()).map(([c, s]) => [heads[c], s.value]));
    holder.replaceChildren();
    bar.selects.clear();
    const b = bar;
    for (const [col, vals] of choices) {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `Filter by ${heads[col]}`);
      sel.append(new Option(`All ${heads[col].replace(/\s*₹$/, "").toLowerCase()}`, ""));
      for (const v of vals) sel.append(new Option(v.length > 40 ? `${v.slice(0, 40)}…` : v, v));
      const keep = prev.get(heads[col]);
      if (keep && vals.includes(keep)) sel.value = keep;
      sel.addEventListener("change", () => apply(table, b));
      holder.append(sel);
      bar.selects.set(col, sel);
    }
    bar.signature = signature;
  }
  apply(table, bar);
}

function scan() {
  for (const t of Array.from(live)) {
    if (!t.isConnected) {
      bars.get(t)?.el.remove();
      live.delete(t);
    }
  }
  document.querySelectorAll<HTMLTableElement>("main table.data").forEach((table) => {
    if (table.matches(SKIP)) return;
    const bar = bars.get(table);
    if (!bar && dataRows(table).length < MIN_ROWS) return;
    if (bar && !bar.el.isConnected) {
      const anchor = table.closest(".table-scroll") || table;
      anchor.parentElement?.insertBefore(bar.el, anchor);
    }
    build(table, bar);
  });
}

export function TableFilters() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        scan();
      });
    };
    const observer = new MutationObserver((records) => {
      // Ignore changes inside our own filter bars.
      if (records.every((r) => (r.target as Element).closest?.(".auto-filter"))) return;
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
