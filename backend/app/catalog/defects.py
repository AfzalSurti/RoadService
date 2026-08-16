"""
Issue category / type catalog from client defect sheets
(`Entry for software (3).xlsx`: Pavement, Structure, Safety, Toll ATMS).

ID rules:
- Prefer stable IDs already used in production when the label matches.
- ATMS / Toll → ATMS-n / TOLL-n
- Safety → S1, S2, ...
- Pavement / structure sections → PAV-n, PS-n, BR-n, CU-n, RW-n
- Misc extras (not on the Excel sheets) keep letter-style IDs
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DefectType:
    id: str
    label: str
    category_id: str


CATEGORIES: list[dict[str, str]] = [
    {"id": "PAVEMENT", "name": "Pavement Defects"},
    {"id": "PAVEMENT_STRUCTURAL", "name": "Pavement Structural Defects"},
    {"id": "BRIDGE", "name": "Bridge Structural Defects"},
    {"id": "CULVERT", "name": "Culvert Structural Defects"},
    {"id": "RETAINING_WALL", "name": "Retaining Wall Structural Defects"},
    {"id": "SAFETY", "name": "Safety"},
    {"id": "ATMS", "name": "ATMS-Related Defects"},
    {"id": "TOLL_ATMS", "name": "Toll Plaza-Related Defects"},
    {"id": "MISC", "name": "Misc"},
]


def _norm(s: str) -> str:
    return " ".join(str(s).lower().replace("/", " ").replace("-", " ").split())


# Stable IDs from the previous catalog (label → id) so existing issues keep resolving.
_LEGACY_ID_BY_LABEL: dict[str, str] = {
    _norm(k): v
    for k, v in {
        "Variable Message Sign (VMS) Not Working": "ATMS-1",
        "VMS Display Partially Functional": "ATMS-2",
        "Blank VMS Display": "ATMS-3",
        "Faded/Unreadable VMS Display": "ATMS-4",
        "CCTV Camera Not Working": "ATMS-5",
        "CCTV Camera Misaligned": "ATMS-6",
        "CCTV Camera Lens Damaged/Dirty": "ATMS-7",
        "PTZ Camera Control Failure": "ATMS-8",
        "Automatic Traffic Counter & Classifier (ATCC) Not Working": "ATMS-9",
        "Wrong Vehicle Classification": "ATMS-10",
        "Weigh-in-Motion (WIM) System Failure": "ATMS-11",
        "Speed Detection System Failure": "ATMS-12",
        "Weather Monitoring Station Failure": "ATMS-13",
        "Emergency Call Box Not Working": "ATMS-14",
        "Traffic Signal Not Working": "ATMS-15",
        "Lane Control Signal Failure": "ATMS-16",
        "Wrong Lane Status Display": "ATMS-17",
        "Fiber Optic Cable Damage": "ATMS-18",
        "Communication Network Failure": "S1",
        "Power Supply Failure": "S2",
        "UPS/Battery Failure": "S3",
        "Solar Panel Damage (if applicable)": "S4",
        "Controller Cabinet Damaged": "S5",
        "Controller Cabinet Door Open/Damaged": "ATMS-19",
        "Lightning Protection Failure": "ATMS-20",
        "Data Transmission Failure": "ATMS-21",
        "Server Communication Failure": "ATMS-22",
        "GPS Time Synchronization Failure": "ATMS-23",
        "Camera Pole/Foundation Damage": "ATMS-24",
        "Gantry Structure Damage": "ATMS-25",
        "ETC (FASTag) Reader Not Working": "ATMS-26",
        "RFID Antenna Failure": "ATMS-27",
        "Boom Barrier Not Working": "ATMS-28",
        "Boom Barrier Slow Operation": "ATMS-29",
        "Boom Barrier Damaged": "ATMS-30",
        "Toll Lane Closed Due to Equipment Failure": "ATMS-31",
        "Lane Indicator Not Working": "ATMS-32",
        "Toll Booth Communication Failure": "ATMS-33",
        "Ticket Printer Failure": "ATMS-34",
        "Receipt Printer Failure": "ATMS-35",
        "Vehicle Detection Loop Failure": "ATMS-36",
        "Axle Detection Sensor Failure": "ATMS-37",
        "Vehicle Classifier Failure": "ATMS-38",
        "Lane Camera Not Working": "ATMS-39",
        "ANPR Camera Failure": "ATMS-40",
        "Toll Plaza Lighting Failure": "ATMS-41",
        "UPS Failure": "ATMS-42",
        "DG Backup Failure": "ATMS-43",
        "Weighbridge/WIM Failure": "S6",
        "Server/Network Failure": "S7",
        "Lane Computer Failure": "S8",
        "Display Board Not Working": "S9",
        "Audio/Intercom Failure": "S10",
        "Toll Booth Structural Damage": "T",
        "Toll Canopy Damage": "T2",
        "Water Leakage in Booth": "S11",
        "Fire Extinguisher Missing/Expired": "S12",
        "Emergency Alarm Failure": "S13",
        "Generator Failure": "S14",
        "Lane Marking Faded at Toll Plaza": "S15",
        "Scour": "S",
        "Settlement": "S16",
        "Blockage": "B",
        "Leakage": "L",
        "Reinforcement Corrosion": "R",
        "Tilting": "T3",
        "Bulging": "B2",
        "Cracking": "C",
        "Sliding": "S17",
        "Joint Opening": "S18",
        "Drainage Failure": "S19",
        "Erosion at Toe": "S20",
        "Stone/Masonry Displacement": "S21",
        "Open Drain Without Protection": "O",
        "Damaged Footpath": "D",
        "Missing Footpath": "M",
        "Damaged Pedestrian Crossing": "D2",
        "Missing Pedestrian Crossing": "M2",
        "Damaged Speed Breaker": "D3",
        "Missing Speed Breaker Marking": "M3",
        "Missing Rumble Strip": "M4",
        "Damaged Rumble Strip": "D4",
        "Water Logging on Carriageway": "W",
        "Loose Debris on Road": "S22",
        "Fallen Tree / Obstruction": "S23",
        "Encroachment on Road": "S24",
        "Damaged Street Lighting": "S25",
        "Non-functional Traffic Signal": "S26",
        "Removal of dead Animals": "R2",
        "Removal of broken down / accident vehicles": "R3",
        "Removal of fallen trees, road blockade": "R4",
        "Availability and Functioning of mobile crane": "A",
        "Other": "O2",
        "Drain cover missing": "D5",
        "Drain cover damaged": "D6",
        "Median drain damaged": "M5",
        "MBCB damaged": "M6",
    }.items()
}


def _alloc(label: str, preferred: str, used: set[str]) -> str:
    legacy = _LEGACY_ID_BY_LABEL.get(_norm(label))
    if legacy and legacy not in used:
        used.add(legacy)
        return legacy
    if preferred not in used:
        used.add(preferred)
        return preferred
    n = 2
    while f"{preferred}-{n}" in used and n < 500:
        n += 1
    # Prefer suffix without breaking ATMS-style: if preferred has digits already, append x
    code = f"{preferred}x{n}" if preferred[-1].isdigit() else f"{preferred}{n}"
    while code in used:
        n += 1
        code = f"{preferred}x{n}" if preferred[-1].isdigit() else f"{preferred}{n}"
    used.add(code)
    return code


def _add(
    types: list[DefectType],
    used: set[str],
    category_id: str,
    labels: list[str],
    prefix: str,
    start: int = 1,
) -> None:
    for i, label in enumerate(labels):
        preferred = f"{prefix}-{start + i}" if prefix else label[:1].upper()
        code = _alloc(label, preferred, used)
        types.append(DefectType(id=code, label=label, category_id=category_id))


def build_defect_types() -> list[DefectType]:
    used: set[str] = set()
    types: list[DefectType] = []

    # --- Pavement Defects (sheet 1) ---
    _add(
        types,
        used,
        "PAVEMENT",
        [
            "Alligator (Fatigue) Cracking",
            "Longitudinal Cracking",
            "Transverse Cracking",
            "Block Cracking",
            "Edge Cracking",
            "Reflection Cracking",
            "Slippage Cracking",
            "Rutting",
            "Depression",
            "Shoving",
            "Corrugation",
            "Potholes",
            "Patching",
            "Ravelling",
            "Bleeding / Flushing",
            "Polished Aggregate",
            "Loss of Surface Texture",
            "Delamination",
            "Stripping",
            "Utility Cut Patch",
            "Shoulder Drop-off",
            "Edge Break",
            "Water Ponding",
            "Lane/Shoulder Settlement",
        ],
        "PAV",
    )

    # --- Structure: Pavement Structural ---
    _add(
        types,
        used,
        "PAVEMENT_STRUCTURAL",
        [
            "Fatigue (Alligator) Cracking",
            "Structural Rutting",
            "Base Failure",
            "Subgrade Failure",
            "Pavement Settlement",
            "Differential Settlement",
            "Heaving",
            "Localized Collapse",
            "Loss of Support",
            "Severe Depression",
            "Edge Failure",
            "Shoulder Failure",
            "Sink Hole",
        ],
        "PS",
    )

    # --- Structure: Bridge ---
    _add(
        types,
        used,
        "BRIDGE",
        [
            "Cracks (Longitudinal, Transverse, Diagonal)",
            "Spalling of Concrete",
            "Honeycombing",
            "Delamination",  # bridge — distinct id from pavement Delamination
            "Reinforcement Corrosion",
            "Exposed Reinforcement",
            "Concrete Scaling",
            "Concrete Disintegration",
            "Structural Settlement",
            "Bearing Damage",
            "Bearing Displacement",
            "Expansion Joint Failure",
            "Girder Cracks",
            "Girder Deflection",
            "Deck Cracking",
            "Deck Delamination",
            "Deck Spalling",
            "Parapet Damage",
            "Pier Cracking",
            "Pier Settlement",
            "Abutment Cracking",
            "Wing Wall Cracking",
            "Scour Around Foundation",
            "Leakage Through Deck",
            "Dampness/Seepage",
            "Void Formation",
        ],
        "BR",
    )

    # --- Structure: Culvert ---
    _add(
        types,
        used,
        "CULVERT",
        [
            "Barrel Cracking",
            "Joint Separation",
            "Inlet Damage",
            "Outlet Damage",
            "Headwall Cracking",
            "Wing Wall Damage",
            "Apron Damage",
            "Scour",
            "Settlement",
            "Blockage",
            "Leakage",
            "Reinforcement Corrosion",
        ],
        "CU",
    )

    # --- Structure: Retaining wall ---
    _add(
        types,
        used,
        "RETAINING_WALL",
        [
            "Tilting",
            "Bulging",
            "Cracking",
            "Settlement",
            "Sliding",
            "Joint Opening",
            "Drainage Failure",
            "Erosion at Toe",
            "Stone/Masonry Displacement",
        ],
        "RW",
    )

    # --- Safety (sheet Saftey) — full 40 ---
    _add(
        types,
        used,
        "SAFETY",
        [
            "Missing Road Sign",
            "Damaged Road Sign",
            "Faded Road Markings",
            "Missing Lane Markings",
            "Missing Edge Line",
            "Damaged Crash Barrier / Guardrail",
            "Missing Crash Barrier",
            "Damaged Median Barrier",
            "Missing Delineators",
            "Damaged Delineators",
            "Missing Road Studs (Cat's Eyes)",
            "Damaged Road Studs",
            "Missing Chevron Signs",
            "Damaged Chevron Signs",
            "Missing Hazard Marker",
            "Damaged Hazard Marker",
            "Missing Kilometer Stone",
            "Damaged Kilometer Stone",
            "Missing Boundary Stone",
            "Missing Object Marker",
            "Poor Night Visibility",
            "Obstructed Sight Distance",
            "Overgrown Vegetation Obstructing Visibility",
            "Shoulder Drop-off",
            "Unsafe Road Edge",
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
            "Loose Debris on Road",
            "Fallen Tree / Obstruction",
            "Encroachment on Road",
            "Damaged Street Lighting",
            "Non-functional Traffic Signal",
        ],
        "S",
    )

    # --- ATMS-Related (30) ---
    _add(
        types,
        used,
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
            "Communication Network Failure",
            "Power Supply Failure",
            "UPS/Battery Failure",
            "Solar Panel Damage (if applicable)",
            "Controller Cabinet Damaged",
            "Controller Cabinet Door Open/Damaged",
            "Lightning Protection Failure",
            "Data Transmission Failure",
            "Server Communication Failure",
            "GPS Time Synchronization Failure",
            "Camera Pole/Foundation Damage",
            "Gantry Structure Damage",
        ],
        "ATMS",
    )

    # --- Toll Plaza (30) ---
    _add(
        types,
        used,
        "TOLL_ATMS",
        [
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
            "Weighbridge/WIM Failure",
            "Server/Network Failure",
            "Lane Computer Failure",
            "Display Board Not Working",
            "Audio/Intercom Failure",
            "Toll Booth Structural Damage",
            "Toll Canopy Damage",
            "Water Leakage in Booth",
            "Fire Extinguisher Missing/Expired",
            "Emergency Alarm Failure",
            "Generator Failure",
            "Lane Marking Faded at Toll Plaza",
        ],
        "TOLL",
    )

    # --- Misc extras already in app (not on Excel sheets) ---
    _add(
        types,
        used,
        "MISC",
        [
            "Removal of dead Animals",
            "Removal of broken down / accident vehicles",
            "Removal of fallen trees, road blockade",
            "Availability and Functioning of mobile crane",
            "Other",
            "Drain cover missing",
            "Drain cover damaged",
            "Median drain damaged",
            "MBCB damaged",
        ],
        "MISC",
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
