import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { InventorySheet, InventorySheetSummary } from "../types";

const PAGE = 300;

/**
 * Package inventory workbook: one tab per sheet (Major Junctions, Bus Bay, …),
 * shown like the Excel sheet with merged headers. GMC Experts can add, rename
 * and delete tabs, edit cells, add / delete rows and columns, or replace
 * everything from a new workbook.
 */
export function InventorySheets({ projectId }: { projectId: number }) {
  const { token, role, isReadonly } = useAuth();
  const canManage = role === "admin" && !isReadonly;
  const [tabs, setTabs] = useState<InventorySheetSummary[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<InventorySheet | null>(null);
  const [draft, setDraft] = useState<{ grid: string[][]; merges: number[][] } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [params] = useSearchParams();
  const linkSheet = Number(params.get("sheet") || 0) || null;

  const loadTabs = (selectFirst = true) => {
    if (!token) return;
    api
      .inventorySheets(token, projectId)
      .then((t) => {
        setTabs(t);
        setError(null);
        const linked = linkSheet && t.some((x) => x.id === linkSheet) ? linkSheet : null;
        if (linked) setActiveId(linked);
        else if (selectFirst || !t.some((x) => x.id === activeId)) setActiveId(t[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    setTabs(null);
    setSheet(null);
    setActiveId(null);
    loadTabs();
  }, [token, projectId, linkSheet]);

  useEffect(() => {
    if (!token || !activeId) return;
    setSheet(null);
    setDraft(null);
    setLimit(PAGE);
    setSearch("");
    api
      .inventorySheet(token, projectId, activeId)
      .then(setSheet)
      .catch((e: Error) => setError(e.message));
  }, [token, projectId, activeId]);

  const grid = draft?.grid ?? sheet?.grid ?? [];
  const merges = draft?.merges ?? sheet?.merges ?? [];
  const width = useMemo(() => Math.max(0, ...grid.map((r) => r.length)), [grid]);

  // Cells covered by a merge (not its top-left anchor) are not rendered.
  const { anchors, covered } = useMemo(() => {
    const a = new Map<string, number[]>();
    const c = new Set<string>();
    for (const m of merges) {
      const [r, col, rs, cs] = m;
      a.set(`${r}:${col}`, m);
      for (let i = r; i < r + rs; i++) for (let j = col; j < col + cs; j++) if (i !== r || j !== col) c.add(`${i}:${j}`);
    }
    return { anchors: a, covered: c };
  }, [merges]);
  const inMultiRowMerge = (row: number) => merges.some(([r, , rs]) => rs > 1 && row >= r && row < r + rs);

  const term = search.trim().toLowerCase();
  const matchRows = useMemo(
    () => (term ? grid.map((r, i) => (r.some((c) => c.toLowerCase().includes(term)) ? i : -1)).filter((i) => i >= 0) : null),
    [grid, term]
  );

  const setCell = (r: number, c: number, value: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = d.grid.map((row) => [...row]);
      while (next[r].length <= c) next[r].push("");
      next[r][c] = value;
      return { ...d, grid: next };
    });

  const addColumn = () =>
    setDraft((d) =>
      d ? { ...d, grid: d.grid.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill(""), ""]) } : d
    );

  // Only the last column can go, and not when a merge reaches into it.
  const lastColLocked = merges.some(([, c, , cs]) => c <= width - 1 && c + cs - 1 >= width - 1);
  const removeLastColumn = () =>
    setDraft((d) => (d && width > 1 ? { ...d, grid: d.grid.map((row) => row.slice(0, width - 1)) } : d));

  const addSheet = async () => {
    if (!token) return;
    if (draft && !window.confirm("Discard unsaved changes to this sheet?")) return;
    const name = window.prompt("Name of the new sheet (tab)", "New sheet")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api.createInventorySheet(token, projectId, {
        name,
        grid: [["S. No.", "Chainage", "Description", "Remarks"], ["1", "", "", ""]],
      });
      setTabs((t) => [...(t || []), created]);
      setActiveId(created.id);
      setMsg(`Sheet “${created.name}” added — click Edit sheet to fill it in.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add the sheet");
    } finally {
      setBusy(false);
    }
  };

  const renameSheet = async () => {
    if (!token || !sheet) return;
    const name = window.prompt("Rename sheet", sheet.name)?.trim();
    if (!name || name === sheet.name) return;
    try {
      const renamed = await api.renameInventorySheet(token, projectId, sheet.id, name);
      setTabs((t) => (t || []).map((x) => (x.id === renamed.id ? renamed : x)));
      setSheet((s) => (s ? { ...s, name: renamed.name } : s));
      setMsg(`Renamed to “${renamed.name}”.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Rename failed");
    }
  };

  const deleteSheet = async () => {
    if (!token || !sheet) return;
    if (!window.confirm(`Delete the sheet “${sheet.name}” and all its rows? This cannot be undone.`)) return;
    try {
      await api.deleteInventorySheet(token, projectId, sheet.id);
      const rest = (tabs || []).filter((x) => x.id !== sheet.id);
      setTabs(rest);
      setActiveId(rest[0]?.id ?? null);
      setSheet(null);
      setMsg(`Sheet “${sheet.name}” deleted.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const addRow = () =>
    setDraft((d) => (d ? { ...d, grid: [...d.grid, Array.from({ length: width || 1 }, () => "")] } : d));

  const deleteRow = (row: number) =>
    setDraft((d) => {
      if (!d) return d;
      const next = d.grid.filter((_, i) => i !== row);
      const shifted = d.merges
        .filter(([r, , rs]) => !(r === row && rs === 1))
        .map(([r, c, rs, cs]) => (r > row ? [r - 1, c, rs, cs] : [r, c, rs, cs]));
      return { grid: next, merges: shifted };
    });

  const save = async () => {
    if (!token || !sheet || !draft) return;
    setBusy(true);
    try {
      const saved = await api.saveInventorySheet(token, projectId, sheet.id, draft);
      setSheet(saved);
      setDraft(null);
      setMsg(`“${saved.name}” saved.`);
      loadTabs(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const importWorkbook = async (file: File | undefined) => {
    if (!token || !file) return;
    if (!window.confirm(`Replace all inventory tabs for this package with the sheets of “${file.name}”?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const t = await api.importInventoryWorkbook(token, projectId, file);
      setTabs(t);
      setActiveId(t[0]?.id ?? null);
      setMsg(`Imported ${t.length} sheets from ${file.name}.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const renderRow = (r: number, plain: boolean) => {
    const row = grid[r] || [];
    const cells = [];
    for (let c = 0; c < width; c++) {
      const key = `${r}:${c}`;
      if (!plain && covered.has(key)) continue;
      const m = plain ? undefined : anchors.get(key);
      const rowSpan = m ? Math.max(1, Math.min(m[2], (matchRows ? grid.length : limit) - r)) : undefined;
      const value = row[c] ?? "";
      cells.push(
        <td
          key={c}
          rowSpan={rowSpan && rowSpan > 1 ? rowSpan : undefined}
          colSpan={m && m[3] > 1 ? m[3] : undefined}
          className={m ? "inv-merged" : undefined}
        >
          {draft ? (
            <input value={value} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1}, column ${c + 1}`} />
          ) : (
            value
          )}
        </td>
      );
    }
    return (
      <tr key={r} className={r === 0 ? "inv-title" : undefined}>
        {draft ? (
          <td className="inv-rowtools">
            <button
              type="button"
              className="linkish vendor-docs-remove"
              disabled={inMultiRowMerge(r)}
              title={inMultiRowMerge(r) ? "Part of a merged header — cannot delete" : "Delete row"}
              onClick={() => deleteRow(r)}
            >
              ✕
            </button>
          </td>
        ) : null}
        {cells}
      </tr>
    );
  };

  const visibleRows = matchRows ?? Array.from({ length: Math.min(limit, grid.length) }, (_, i) => i);

  return (
    <section className="panel inv-sheets">
      <div className="panel-head-row">
        <h2>Inventory details</h2>
        {canManage ? (
          <div className="btn-row">
            <label className="btn ghost inventory-photo-pick">
              {busy && !draft ? "Importing…" : "Replace from Excel"}
              <input
                type="file"
                accept=".xlsx,.xlsm"
                hidden
                disabled={busy}
                onChange={(e) => {
                  void importWorkbook(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ) : null}
      </div>
      {error ? <div className="error">{error}</div> : null}
      {msg ? <div className="success">{msg}</div> : null}

      {tabs && !tabs.length ? (
        <p className="muted">
          No inventory workbook for this package yet.
          {canManage ? " Use “Replace from Excel” to import one, or add a sheet. " : ""}
          {canManage ? (
            <button type="button" className="btn secondary" onClick={addSheet} disabled={busy}>
              + Add sheet
            </button>
          ) : null}
        </p>
      ) : null}
      {!tabs ? <p className="muted">Loading inventory…</p> : null}

      {tabs && tabs.length ? (
        <>
          <div className="inv-tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === activeId}
                className={`inv-tab${t.id === activeId ? " active" : ""}`}
                onClick={() => {
                  if (draft && !window.confirm("Discard unsaved changes to this sheet?")) return;
                  setActiveId(t.id);
                }}
              >
                {t.name}
              </button>
            ))}
            {canManage ? (
              <button type="button" className="inv-tab inv-tab-add" onClick={addSheet} disabled={busy} title="Add a new sheet">
                + Add sheet
              </button>
            ) : null}
          </div>

          {!sheet ? (
            <p className="muted">Loading sheet…</p>
          ) : (
            <>
              <div className="inv-toolbar">
                <strong>{sheet.name}</strong>
                <span className="muted">
                  {grid.length} rows × {width} columns
                </span>
                {!draft ? (
                  <>
                    {canManage ? (
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setDraft({ grid: sheet.grid, merges: sheet.merges })}
                        >
                          Edit sheet
                        </button>
                        <button type="button" className="btn ghost" onClick={renameSheet}>
                          Rename
                        </button>
                        <button type="button" className="btn ghost danger" onClick={deleteSheet}>
                          Delete sheet
                        </button>
                      </div>
                    ) : null}
                    <input
                      type="search"
                      placeholder="Search in this sheet…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </>
                ) : (
                  <div className="btn-row">
                    <button type="button" className="btn secondary" onClick={addRow}>
                      + Add row
                    </button>
                    <button type="button" className="btn secondary" onClick={addColumn}>
                      + Add column
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={removeLastColumn}
                      disabled={width <= 1 || lastColLocked}
                      title={lastColLocked ? "The last column is part of a merged header" : "Remove the last column"}
                    >
                      − Remove last column
                    </button>
                    <button type="button" className="btn" onClick={save} disabled={busy}>
                      {busy ? "Saving…" : "Save sheet"}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setDraft(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {matchRows ? <p className="muted">{matchRows.length} matching row(s)</p> : null}
              <div className="table-scroll inv-grid-wrap">
                <table className={`inv-grid${draft ? " editing" : ""}`}>
                  <tbody>{visibleRows.map((r) => renderRow(r, Boolean(matchRows)))}</tbody>
                </table>
              </div>
              {!matchRows && grid.length > limit ? (
                <div className="show-more-row">
                  <button type="button" className="btn secondary" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more rows ({grid.length - limit} more)
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
