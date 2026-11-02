"""Read an inventory workbook into display grids (one per visible sheet).

Each sheet becomes {"name", "grid": [[str, ...], ...], "merges": [[row, col, rowspan, colspan], ...]}
trimmed to the cells actually used, with numbers formatted as Excel shows them
(e.g. chainage 880.6 with format "0.000" -> "880.600").
"""

from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook

MAX_ROWS = 6000
MAX_COLS = 160


def _decimals(fmt: str) -> int | None:
    """Decimal places of a simple Excel number format like '0.000' or '#,##0.00'."""
    core = fmt.split(";")[0]
    if "." not in core:
        return 0 if any(ch in core for ch in "0#") else None
    tail = core.split(".", 1)[1]
    return sum(1 for ch in tail if ch in "0#")


def format_cell(value, fmt: str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.strftime("%d-%m-%Y") if not (value.hour or value.minute) else value.strftime("%d-%m-%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d-%m-%Y")
    if isinstance(value, (int, float)):
        fmt = fmt or "General"
        if "%" in fmt:
            places = _decimals(fmt.replace("%", "")) or 0
            return f"{value * 100:.{places}f}%"
        if fmt != "General":
            places = _decimals(fmt)
            if places is not None:
                text = f"{value:,.{places}f}" if "," in fmt else f"{value:.{places}f}"
                return text
        if isinstance(value, float):
            return f"{value:.6f}".rstrip("0").rstrip(".") if not value.is_integer() else str(int(value))
        return str(value)
    return str(value).strip()


def parse_workbook(source: bytes | str | Path) -> list[dict]:
    data = BytesIO(source) if isinstance(source, bytes) else source
    wb = load_workbook(data, data_only=True)
    sheets: list[dict] = []
    for ws in wb.worksheets:
        if ws.sheet_state != "visible":
            continue
        cells: dict[tuple[int, int], str] = {}
        for row in ws.iter_rows(max_row=min(ws.max_row, MAX_ROWS), max_col=min(ws.max_column, MAX_COLS)):
            for cell in row:
                text = format_cell(cell.value, cell.number_format)
                if text:
                    cells[(cell.row, cell.column)] = text
        merges = [
            (m.min_row, m.min_col, m.max_row, m.max_col)
            for m in ws.merged_cells.ranges
            if m.min_row <= MAX_ROWS and m.min_col <= MAX_COLS
        ]
        if not cells:
            continue
        rows = [r for r, _ in cells] + [m[0] for m in merges if (m[0], m[1]) in cells]
        cols = [c for _, c in cells] + [m[1] for m in merges if (m[0], m[1]) in cells]
        r0, c0 = min(rows), min(cols)
        r1 = max([r for r, _ in cells] + [m[2] for m in merges if (m[0], m[1]) in cells])
        c1 = max([c for _, c in cells] + [m[3] for m in merges if (m[0], m[1]) in cells])
        r1, c1 = min(r1, r0 + MAX_ROWS - 1), min(c1, c0 + MAX_COLS - 1)
        grid = [[cells.get((r, c), "") for c in range(c0, c1 + 1)] for r in range(r0, r1 + 1)]
        spans = []
        for mr0, mc0, mr1, mc1 in merges:
            if mr0 < r0 or mc0 < c0 or mr0 > r1 or mc0 > c1:
                continue
            rs, cs = min(mr1, r1) - mr0 + 1, min(mc1, c1) - mc0 + 1
            if rs > 1 or cs > 1:
                spans.append([mr0 - r0, mc0 - c0, rs, cs])
        sheets.append({"name": ws.title.strip() or "Sheet", "grid": grid, "merges": spans})
    return sheets
