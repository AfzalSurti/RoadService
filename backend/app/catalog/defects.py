"""
Issue category / type catalog from client defect sheets.

ID rules:
- ATMS-related defects → ATMS-1, ATMS-2, ...
- Last 5 items of a sheet section → Safety category with S1, S2, ...
- Other types → capital letter of the first word (numeric suffix if collision)
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DefectType:
    id: str
    label: str
    category_id: str


CATEGORIES: list[dict[str, str]] = [
    {"id": "ATMS", "name": "ATMS-Related Defects"},
    {"id": "TOLL_ATMS", "name": "Toll ATMS / Toll Plaza"},
    {"id": "STRUCTURE", "name": "Structure Defects"},
    {"id": "RETAINING_WALL", "name": "Retaining Wall Structural Defects"},
    {"id": "SAFETY", "name": "Safety"},
]


def _letter_ids(labels: list[str], category_id: str, used: set[str]) -> list[DefectType]:
    """Capital letter(s) of the first word; lengthen/suffix on collision. Avoids Sn safety IDs."""
    out: list[DefectType] = []
    for label in labels:
        first = "".join(ch for ch in label.split()[0] if ch.isalpha()).upper() or "X"

        def is_safety_code(code: str) -> bool:
            return len(code) >= 2 and code[0] == "S" and code[1:].isdigit()

        code = None
        for length in (1, 2, 3, len(first) or 1):
            base = first[: max(1, length)]
            if base not in used and not is_safety_code(base):
                code = base
                break
            n = 2
            while n < 100:
                trial = f"{base}{n}"
                if trial not in used and not is_safety_code(trial):
                    code = trial
                    break
                n += 1
            if code:
                break

        if not code:
            # Last resort unique token
            n = 1
            while f"X{n}" in used:
                n += 1
            code = f"X{n}"

        used.add(code)
        out.append(DefectType(id=code, label=label, category_id=category_id))
    return out


def _numbered(prefix: str, labels: list[str], category_id: str, used: set[str], start: int = 1) -> list[DefectType]:
    out: list[DefectType] = []
    for i, label in enumerate(labels):
        code = f"{prefix}-{start + i}"
        if code in used:
            raise ValueError(f"Duplicate catalog id {code}")
        used.add(code)
        out.append(DefectType(id=code, label=label, category_id=category_id))
    return out


def _safety(labels: list[str], used: set[str], start: int = 1) -> list[DefectType]:
    out: list[DefectType] = []
    for i, label in enumerate(labels):
        code = f"S{start + i}"
        if code in used:
            raise ValueError(f"Duplicate catalog id {code}")
        used.add(code)
        out.append(DefectType(id=code, label=label, category_id="SAFETY"))
    return out


def build_defect_types() -> list[DefectType]:
    used: set[str] = set()
    types: list[DefectType] = []

    types.extend(
        _numbered(
            "ATMS",
            [
                "Variable Message Sign (VMS) Not Working",
                "VMS Display Partially Functional",
                "Blank VMS Display",
                "Faded/Unreadable VMS Display",
                "CCTV Camera Not Working",
                "CCTV Camera Misaligned",
                "CCTV Camera Lens Damaged/Dirty",
                "PTZ Camera Control Failure",
                "Automatic Traffic Counter & Classifier (ATCC) Not Working",
                "Wrong Vehicle Classification",
                "Weigh-in-Motion (WIM) System Failure",
                "Speed Detection System Failure",
                "Weather Monitoring Station Failure",
                "Emergency Call Box Not Working",
                "Traffic Signal Not Working",
                "Lane Control Signal Failure",
                "Wrong Lane Status Display",
                "Fiber Optic Cable Damage",
            ],
            "ATMS",
            used,
            start=1,
        )
    )
    types.extend(
        _safety(
            [
                "Communication Network Failure",
                "Power Supply Failure",
                "UPS/Battery Failure",
                "Solar Panel Damage (if applicable)",
                "Controller Cabinet Damaged",
            ],
            used,
            start=1,
        )
    )

    types.extend(
        _numbered(
            "ATMS",
            [
                "Controller Cabinet Door Open/Damaged",
                "Lightning Protection Failure",
                "Data Transmission Failure",
                "Server Communication Failure",
                "GPS Time Synchronization Failure",
                "Camera Pole/Foundation Damage",
                "Gantry Structure Damage",
                "ETC (FASTag) Reader Not Working",
                "RFID Antenna Failure",
                "Boom Barrier Not Working",
                "Boom Barrier Slow Operation",
                "Boom Barrier Damaged",
                "Toll Lane Closed Due to Equipment Failure",
                "Lane Indicator Not Working",
                "Toll Booth Communication Failure",
                "Ticket Printer Failure",
                "Receipt Printer Failure",
                "Vehicle Detection Loop Failure",
                "Axle Detection Sensor Failure",
                "Vehicle Classifier Failure",
                "Lane Camera Not Working",
                "ANPR Camera Failure",
                "Toll Plaza Lighting Failure",
                "UPS Failure",
                "DG Backup Failure",
            ],
            "TOLL_ATMS",
            used,
            start=19,
        )
    )
    types.extend(
        _safety(
            [
                "Weighbridge/WIM Failure",
                "Server/Network Failure",
                "Lane Computer Failure",
                "Display Board Not Working",
                "Audio/Intercom Failure",
            ],
            used,
            start=6,
        )
    )

    types.extend(
        _letter_ids(
            ["Toll Booth Structural Damage", "Toll Canopy Damage"],
            "TOLL_ATMS",
            used,
        )
    )
    types.extend(
        _safety(
            [
                "Water Leakage in Booth",
                "Fire Extinguisher Missing/Expired",
                "Emergency Alarm Failure",
                "Generator Failure",
                "Lane Marking Faded at Toll Plaza",
            ],
            used,
            start=11,
        )
    )

    types.extend(
        _letter_ids(
            ["Scour", "Settlement", "Blockage", "Leakage", "Reinforcement Corrosion"],
            "STRUCTURE",
            used,
        )
    )

    types.extend(
        _letter_ids(
            ["Tilting", "Bulging", "Cracking", "Settlement"],
            "RETAINING_WALL",
            used,
        )
    )
    types.extend(
        _safety(
            [
                "Sliding",
                "Joint Opening",
                "Drainage Failure",
                "Erosion at Toe",
                "Stone/Masonry Displacement",
            ],
            used,
            start=16,
        )
    )

    types.extend(
        _letter_ids(
            [
                "Open Drain Without Protection",
                "Damaged Footpath",
                "Missing Footpath",
                "Damaged Pedestrian Crossing",
                "Missing Pedestrian Crossing",
                "Damaged Speed Breaker",
                "Missing Speed Breaker Marking",
                "Missing Rumble Strip",
                "Damaged Rumble Strip",
                "Water Logging on Carriageway",
            ],
            "SAFETY",
            used,
        )
    )
    types.extend(
        _safety(
            [
                "Loose Debris on Road",
                "Fallen Tree / Obstruction",
                "Encroachment on Road",
                "Damaged Street Lighting",
                "Non-functional Traffic Signal",
            ],
            used,
            start=21,
        )
    )
    return types


DEFECT_TYPES: list[DefectType] = build_defect_types()
DEFECT_BY_ID: dict[str, DefectType] = {d.id: d for d in DEFECT_TYPES}
assert len(DEFECT_BY_ID) == len(DEFECT_TYPES), "Duplicate defect type IDs in catalog"


def catalog_payload() -> dict:
    return {
        "categories": CATEGORIES,
        "types": [
            {"id": d.id, "label": d.label, "category_id": d.category_id}
            for d in DEFECT_TYPES
        ],
    }


def resolve_defect(issue_type_id: str, work_category_id: str | None = None) -> DefectType:
    defect = DEFECT_BY_ID.get(issue_type_id)
    if not defect:
        raise ValueError(f"Unknown issue type id: {issue_type_id}")
    if work_category_id and work_category_id != defect.category_id:
        raise ValueError(
            f"Type {issue_type_id} belongs to {defect.category_id}, not {work_category_id}"
        )
    return defect
