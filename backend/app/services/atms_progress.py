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


def read_atms_progress(content: bytes) -> dict:
    wf = openpyxl.load_workbook(BytesIO(content), data_only=False)
    wv = openpyxl.load_workbook(BytesIO(content), data_only=True)
    sf, sv = wf.worksheets[0], wv.worksheets[0]

    # Header row: the one with "Work Details" / "Total" / "Completed".
    head_row = None
    for r in range(1, min(sf.max_row, 15) + 1):
        vals = [(_txt(sv.cell(r, c).value)).lower() for c in range(1, 10)]
        if any("work" in v for v in vals) and "total" in vals:
            head_row = r
            break
    if head_row is None:
        raise ValueError("Header row (Sr, Work Details, UOM, Total, Completed ...) not found")
    headers = [_txt(sv.cell(head_row, c).value) for c in range(1, 10)]
    title = " ".join(_txt(sv.cell(r, 1).value) for r in range(1, head_row) if _txt(sv.cell(r, 1).value)).strip()

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
    return {"title": title, "headers": headers, "rows": rows}
