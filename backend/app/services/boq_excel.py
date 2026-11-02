"""BOQ Excel: the sample sheet users fill, and reading it back for import.

Columns (row 1 headers, data from row 2 until the TOTAL rows):
A Item No. | B Description | C Unit | D Quantity | E Rate (INR) | F Amount (calc)
G Quantity Executed till Date | H Balance (calc) | I Progress % (calc)
J Weightage % (calc) | K Physical Progress Contribution % (calc)
"""

from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook

TEMPLATE = Path(__file__).resolve().parent.parent / "catalog" / "boq_template.xlsx"
FIRST_ROW = 2
TOTAL_ROW = 30  # "TOTAL CONTRACT PRICE" in the template


def template_bytes() -> bytes:
    """The BOQ format with per-row formulas so Amount / Balance / Progress fill in as people type."""
    wb = load_workbook(TEMPLATE)
    ws = wb.active
    for r in range(FIRST_ROW, TOTAL_ROW):
        ws[f"F{r}"] = f'=IF(AND(ISNUMBER(D{r}),ISNUMBER(E{r})),D{r}*E{r},"")'
        ws[f"H{r}"] = f'=IF(ISNUMBER(D{r}),D{r}-N(G{r}),"")'
        ws[f"I{r}"] = f'=IF(AND(ISNUMBER(D{r}),D{r}>0),N(G{r})/D{r},"")'
        ws[f"J{r}"] = f'=IF(AND(ISNUMBER(F{r}),$F${TOTAL_ROW}>0),F{r}/$F${TOTAL_ROW},"")'
        ws[f"K{r}"] = f'=IF(AND(ISNUMBER(I{r}),ISNUMBER(J{r})),I{r}*J{r},"")'
        for col in "IJK":
            ws[f"{col}{r}"].number_format = "0.00%"
        for col in "EFG":
            ws[f"{col}{r}"].number_format = "#,##0.00"
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _num(value) -> Decimal | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f"'{value}' is not a number")


def read_boq_rows(content: bytes) -> tuple[list[dict], list[str]]:
    """Rows to import and per-row problems. Stops at the TOTAL rows or the sheet end."""
    wb = load_workbook(BytesIO(content), data_only=True)
    ws = wb.active
    rows: list[dict] = []
    problems: list[str] = []
    for r in range(FIRST_ROW, ws.max_row + 1):
        item_no = ws[f"A{r}"].value
        desc = ws[f"B{r}"].value
        label = str(item_no or desc or "").strip().upper()
        if label.startswith(("TOTAL", "GST", "GRAND TOTAL")):
            break
        if item_no in (None, "") and desc in (None, ""):
            continue
        try:
            qty = _num(ws[f"D{r}"].value)
            rate = _num(ws[f"E{r}"].value)
            done = _num(ws[f"G{r}"].value)
        except ValueError as exc:
            problems.append(f"Row {r}: {exc}")
            continue
        if item_no in (None, ""):
            problems.append(f"Row {r}: Item No. is missing")
            continue
        if not desc or len(str(desc).strip()) < 2:
            problems.append(f"Row {r} (item {item_no}): description is missing")
            continue
        if qty is None or qty <= 0:
            problems.append(f"Row {r} (item {item_no}): Quantity must be more than 0")
            continue
        if rate is None or rate < 0:
            problems.append(f"Row {r} (item {item_no}): Rate is missing")
            continue
        if done is not None and (done < 0 or done > qty):
            problems.append(f"Row {r} (item {item_no}): Quantity executed must be between 0 and {qty}")
            continue
        if isinstance(item_no, float) and item_no.is_integer():
            item_no = int(item_no)
        unit = str(ws[f"C{r}"].value or "").strip() or "No."
        rows.append(
            {
                "row": r,
                "item_no": str(item_no).strip()[:64],
                "description": str(desc).strip(),
                "unit": unit[:32],
                "quantity": qty,
                "rate": rate,
                "executed": done,
            }
        )
    return rows, problems
