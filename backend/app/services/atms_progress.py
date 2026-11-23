"""Read an "ATMS Project Status" tracker workbook (Sr / Work Details / UOM / Total / Completed /
Balance / Completed (%) / Target Date / Remarks) into rows the portal can show and recalculate.

Each row keeps its Excel row number so the sheet's own formulas can be re-applied:
  item   - a work line; % = Completed / Total (unless the sheet typed a fixed %)
  group  - a heading; may carry a % (SUBTOTAL over the items below it)
  agg    - a % row: "range" = average of the item %s in rows a..b (Excel SUBTOTAL(1, Ga:Gb)),
           "list"  = average of other % rows (Excel AVERAGE(Gx, Gy, ...))
"""

import re
from datetime import date, datetime
from io import BytesIO
from typing import Any

import openpyxl

_RANGE = re.compile(r"SUBTOTAL\(\s*1\s*,\s*G(\d+)\s*:\s*G(\d+)\s*\)", re.I)
_CELL = re.compile(r"G(\d+)")


def _txt(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%d.%m.%Y")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def _num(v: Any) -> float | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


_DATE = re.compile(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})")


def find_date(text: str) -> date | None:
    """Last dd.mm.yyyy (or dd-mm-yyyy, dd/mm/yyyy) in a text, e.g. "Tracker upto 20.11.2026"."""
    found = None
    for d, m, y in _DATE.findall(text or ""):
        try:
            found = date(int(y), int(m), int(d))
        except ValueError:
            continue
    return found


def _header_row(sv) -> int | None:
    for r in range(1, min(sv.max_row, 15) + 1):
        vals = [(_txt(sv.cell(r, c).value)).lower() for c in range(1, 10)]
        if any("work" in v for v in vals) and "total" in vals:
            return r
    return None


def _title(sv, head_row: int) -> str:
    """Every text cell above the header row (any column), e.g. "BWK ATMS Project Tracker upto 20.11.2026"."""
    parts: list[str] = []
    for r in range(1, head_row):
        for c in range(1, min(sv.max_column, 12) + 1):
            t = _txt(sv.cell(r, c).value)
            if t and t not in parts:
                parts.append(t)
    return " · ".join(parts)


def read_atms_progress(content: bytes) -> dict:
    wf = openpyxl.load_workbook(BytesIO(content), data_only=False)
    wv = openpyxl.load_workbook(BytesIO(content), data_only=True)

    # A tracker workbook often keeps older sheets (e.g. "15.10.2026") next to the newest one:
    # use the sheet with the latest date in its title or name, else the sheet Excel opens on.
    candidates = []
    for i, sv in enumerate(wv.worksheets):
        hr = _header_row(sv)
        if hr is None:
            continue
        d = find_date(_title(sv, hr)) or find_date(sv.title)
        candidates.append((d or date.min, i == wv.index(wv.active), i, hr))
    if not candidates:
        raise ValueError("Header row (Sr, Work Details, UOM, Total, Completed ...) not found")
    _, _, idx, head_row = max(candidates)
    sv, sf = wv.worksheets[idx], wf.worksheets[idx]
    headers = [_txt(sv.cell(head_row, c).value) for c in range(1, 10)]
    title = _title(sv, head_row)

    rows: list[dict] = []
    for r in range(head_row + 1, sf.max_row + 1):
        a, b, uom = sv.cell(r, 1).value, sv.cell(r, 2).value, sv.cell(r, 3).value
        total, done = sv.cell(r, 4).value, sv.cell(r, 5).value
        g_formula, g_value = sf.cell(r, 7).value, sv.cell(r, 7).value
        target, remark = sv.cell(r, 8).value, sv.cell(r, 9).value
        if all(sv.cell(r, c).value in (None, "") for c in range(1, 10)):
            continue
        row: dict[str, Any] = {"r": r, "sr": _txt(a), "work": _txt(b), "uom": _txt(uom),
                               "target": _txt(target), "remark": _txt(remark)}
        formula = g_formula if isinstance(g_formula, str) and g_formula.startswith("=") else ""
        m = _RANGE.search(formula)
        is_item = _num(total) is not None and _txt(uom) != ""
        if is_item:
            row.update(kind="item", total=_num(total), completed=_num(done) or 0.0)
            if not formula and _num(g_value) is not None:
                row["fixed_pct"] = _num(g_value)  # typed in the sheet, not calculated
        elif m:
            row.update(kind="agg" if not (_txt(a) or _txt(b)) else "group",
                       agg={"type": "range", "from": int(m.group(1)), "to": int(m.group(2))})
        elif formula.upper().startswith("=AVERAGE"):
            row.update(kind="agg", agg={"type": "list", "rows": [int(x) for x in _CELL.findall(formula)]})
            if not row["work"]:
                row["work"], row["sr"] = row["sr"], ""
        else:
            row.update(kind="group")
            if _num(g_value) is not None:
                row["fixed_pct"] = _num(g_value)
        rows.append(row)
    return {
        "title": title,
        "headers": headers,
        "rows": rows,
        "sheet": sv.title,
        "sheet_date": (find_date(title) or find_date(sv.title) or None),
    }
