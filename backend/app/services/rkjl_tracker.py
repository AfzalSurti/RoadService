"""RKJL WO / PO register + BOQ quantity tracker -> vendors and BOQ items (Jabalpur - Lakhnadon)."""

from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

WORKBOOK = Path(__file__).resolve().parent.parent / "catalog" / "rkjl_tracker.xlsx"
PACKAGE = "Jabalpur - Lakhnadon"


def _d(v):
    if isinstance(v, datetime):
        return v.date()
    return v if isinstance(v, date) else None


def _category(scope: str) -> str:
    s = scope.lower()
    if any(k in s for k in ("light", "atms", "tms", "cctv", "toll", "electr", "camera", "vms")):
        return "ATMS & TMS Work Related"
    if any(k in s for k in ("routine", "maintenance", "cleaning", "housekeeping", "plantation")):
        return "Routine Maintenance Work"
    if "improvement" in s or "schedule" in s:
        return "Schedule B Works"
    return "Particular Item Wise Civil Works"


def read_tracker(path: Path = WORKBOOK):
    wb = load_workbook(path, data_only=True)
    reg = wb["WO_PO_Register"]
    orders = []
    for r in range(5, reg.max_row + 1):
        row = [c.value for c in reg[r]]
        if not isinstance(row[0], (int, float)) or not row[2]:
            continue
        order_date, actual_mob, target_done = _d(row[3]), _d(row[11]), _d(row[13])
        days = (target_done - order_date).days if order_date and target_done else None
        orders.append(
            {
                "wo": str(row[2]).strip(),
                "type": str(row[1] or "Work Order"),
                "supplier": str(row[5] or "").strip(),
                "contact": str(row[6] or "").strip(),
                "scope": str(row[7] or "").strip(),
                "location": str(row[8] or "").strip(),
                "order_date": order_date,
                "commencement": actual_mob or _d(row[10]),
                "days": str(days) if days and days > 0 else None,
                "net": row[16],
                "status": str(row[20] or "").strip(),
                "category": _category(f"{row[7]} {row[1]}"),
            }
        )
    q = wb["Quantity_Monitoring"]
    items = []
    for r in range(5, q.max_row + 1):
        row = [c.value for c in q[r]]
        if not isinstance(row[0], (int, float)) or not row[1]:
            continue
        try:
            qty, rate = float(row[6] or 0), float(row[7] or 0)
        except (TypeError, ValueError):
            continue
        if qty <= 0:
            continue
        done = float(row[8] or 0)
        items.append(
            {
                "wo": str(row[1]).strip(),
                "item_no": str(row[3] if row[3] is not None else row[0]).strip()[:64],
                "description": str(row[4] or "").strip() or "BOQ item",
                "unit": str(row[5] or "No.").strip()[:32],
                "qty": qty,
                "rate": rate,
                "done": max(0.0, min(done, qty)),
            }
        )
    return orders, items
