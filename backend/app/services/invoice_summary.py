"""Default NHAI Summary of Invoice line structure + totals helper."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any


def _lines(items: list[tuple[str, str]]) -> list[dict[str, Any]]:
    return [
        {"code": code, "label": label, "ae": 0.0, "piu": 0.0, "fa": 0.0, "remarks": ""}
        for code, label in items
    ]


DEFAULT_SUMMARY: dict[str, Any] = {
    "work_done": _lines(
        [
            ("1a", "Value of Works executed/Bill of Quantities"),
            ("1b", "Escalation / Price Adjustment"),
            ("1c", "Claim due to change in Law"),
            ("1d", "Variations"),
            ("1e", "Damages"),
            ("1f", "Bonus"),
            ("1g", "Other Payments"),
        ]
    ),
    "gst": _lines(
        [
            ("2a", "CGST @ (on TOTAL)(%)"),
            ("2b", "SGST @ (on TOTAL)(%)"),
            ("2c", "IGST @ (on TOTAL)(%)"),
        ]
    ),
    "advances": _lines(
        [
            ("3a", "Mobilisation Advance"),
            ("3b", "Machinery Advance"),
            ("3c", "Other Advance Paid"),
            ("3d", "GST on Advance"),
        ]
    ),
    "recoveries": _lines(
        [
            ("Ba", "Recovery of Mobilisation Advance"),
            ("Bb", "Recovery of Interest on Mob. Advance"),
            ("Bc", "Recovery of Machinery Advance"),
            ("Bd", "Damage Claims on Contractor/Concessionaire"),
            ("Be", "50% IE Cost"),
            ("Bf", "Interest in delay in payment of 50% of IE Cost"),
            ("Bg", "Interest of working capital Advance"),
            ("Bh", "Recovery of work done at Risk & Cost"),
            ("Bi", "Retention money"),
            ("Bj", "TDS"),
            ("Bk", "GST TDS-CGST"),
            ("Bl", "GST TDS-SGST"),
            ("Bm", "GST TDS-IGST"),
            ("Bn", "Labour Cess"),
            ("Bo", "Amount withheld by Authority Engineer/PD"),
            ("Bp", "GST Amount withheld due to non-submission of proof"),
            ("Bq", "GST Amount adjusted against already paid"),
            ("Br", "Other Deduction/Recoveries"),
        ]
    ),
    "withheld_released": _lines([("D", "Withheld Amount released by Authority Engineer/PD")]),
    "royalty": _lines([("E", "Royalty Reimbursement")]),
    "gst_released": _lines([("F", "GST Amount released after submission of proof")]),
    "others": _lines([("G", "Others")]),
    "balance_claim_pct": 10.0,
}


def default_summary() -> dict[str, Any]:
    return deepcopy(DEFAULT_SUMMARY)


def _sum_col(rows: list[dict[str, Any]], col: str) -> float:
    total = 0.0
    for r in rows or []:
        try:
            total += float(r.get(col) or 0)
        except (TypeError, ValueError):
            pass
    return round(total, 2)


def compute_totals(summary: dict[str, Any]) -> dict[str, Any]:
    work = summary.get("work_done") or []
    gst = summary.get("gst") or []
    adv = summary.get("advances") or []
    rec = summary.get("recoveries") or []
    d = summary.get("withheld_released") or []
    e = summary.get("royalty") or []
    f = summary.get("gst_released") or []
    g = summary.get("others") or []

    total_work = {k: _sum_col(work, k) for k in ("ae", "piu", "fa")}
    total_gst = {k: _sum_col(gst, k) for k in ("ae", "piu", "fa")}
    total_adv = {k: _sum_col(adv, k) for k in ("ae", "piu", "fa")}
    total_a = {k: round(total_work[k] + total_gst[k] + total_adv[k], 2) for k in ("ae", "piu", "fa")}
    total_b = {k: _sum_col(rec, k) for k in ("ae", "piu", "fa")}
    total_c = {k: round(total_a[k] - total_b[k], 2) for k in ("ae", "piu", "fa")}
    total_d = {k: _sum_col(d, k) for k in ("ae", "piu", "fa")}
    total_e = {k: _sum_col(e, k) for k in ("ae", "piu", "fa")}
    total_f = {k: _sum_col(f, k) for k in ("ae", "piu", "fa")}
    total_g = {k: _sum_col(g, k) for k in ("ae", "piu", "fa")}
    total_payable = {
        k: round(total_c[k] + total_d[k] + total_e[k] + total_f[k] + total_g[k], 2)
        for k in ("ae", "piu", "fa")
    }
    pct = float(summary.get("balance_claim_pct") or 0)
    balance_claim = {k: round(total_payable[k] * pct / 100.0, 2) for k in ("ae", "piu", "fa")}

    return {
        "total_work": total_work,
        "total_gst": total_gst,
        "total_advances": total_adv,
        "total_a": total_a,
        "total_b": total_b,
        "total_c": total_c,
        "total_d": total_d,
        "total_e": total_e,
        "total_f": total_f,
        "total_g": total_g,
        "total_payable": total_payable,
        "balance_claim": balance_claim,
        "absolute_amount": total_payable["ae"],
    }


def merge_summary(raw: dict[str, Any] | None) -> dict[str, Any]:
    base = default_summary()
    if not raw:
        return base
    for key in base:
        if key == "balance_claim_pct":
            if "balance_claim_pct" in raw:
                base["balance_claim_pct"] = float(raw.get("balance_claim_pct") or 0)
            continue
        incoming = raw.get(key)
        if not isinstance(incoming, list):
            continue
        by_code = {str(r.get("code")): r for r in incoming if isinstance(r, dict)}
        merged = []
        for row in base[key]:
            src = by_code.get(row["code"], {})
            merged.append(
                {
                    "code": row["code"],
                    "label": src.get("label") or row["label"],
                    "ae": float(src.get("ae") or 0),
                    "piu": float(src.get("piu") or 0),
                    "fa": float(src.get("fa") or 0),
                    "remarks": src.get("remarks") or "",
                }
            )
        # keep any extra custom rows
        known = {r["code"] for r in merged}
        for code, src in by_code.items():
            if code not in known:
                merged.append(
                    {
                        "code": code,
                        "label": src.get("label") or code,
                        "ae": float(src.get("ae") or 0),
                        "piu": float(src.get("piu") or 0),
                        "fa": float(src.get("fa") or 0),
                        "remarks": src.get("remarks") or "",
                    }
                )
        base[key] = merged
    base["totals"] = compute_totals(base)
    return base


def dumps_summary(summary: dict[str, Any]) -> str:
    clean = merge_summary(summary)
    return json.dumps(clean)


def loads_summary(raw: str | None) -> dict[str, Any]:
    if not raw:
        s = default_summary()
        s["totals"] = compute_totals(s)
        return s
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {}
    return merge_summary(data if isinstance(data, dict) else {})
