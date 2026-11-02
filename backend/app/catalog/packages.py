"""Default overview text and tile photos for the three O&M packages (keyed by package `name`).

Loaded into projects.description / image_url only while they still hold the
auto-generated placeholder (or are empty), so edits made in the portal are never
overwritten.
"""

PLACEHOLDER_PREFIX = "Corridor stretch folder project:"

# Default tile photos (static files in web/public/packages); replaceable from the portal.
PACKAGE_IMAGES = {
    "Jabalpur - Lakhnadon": "/packages/jabalpur-lakhnadon.jpg",
    "Lakhnadon - Khawasa": "/packages/mahagaon-khawasa.jpg",
    "Bokhedi - Kelapur": "/packages/borkhedi-kelapur.jpg",
}

PACKAGE_OVERVIEWS = {
    "Jabalpur - Lakhnadon": (
        "A four-lane road on NH-30 and NH-34 with project length of 306.34 kms.\n\n"
        "The asset starts at km 656+000 of NH-30 (Km 242+400 of old NH-7) and ends at Km 1428+557 "
        "of NH 34 in the State of Madhya Pradesh. The asset has four toll plaza at Odhaki Paipkhar "
        "(Km 675+700 of NH 30), Kherwasani (Km 739+000 of NH 30), Mohtara (KM 840+567 of NH 30) and "
        "Boharipar (Km 1362+780 of NH 34).\n\n"
        "The project stretch connects Rewa, Katni, Jabalpur and Lakhnadon districts of Madhya Pradesh. "
        "In the larger road network, the project stretch provides connectivity between East-West "
        "Corridor connecting Kolkata in West Bengal to Delhi and North-South corridor (NH-44) towards "
        "south at Jabalpur."
    ),
    "Lakhnadon - Khawasa": (
        "The asset starts at km 546+420 and ends at km 653+770 in the state of Madhya Pradesh. The "
        "asset has two toll plazas at Madai (KM 549+200) and Khawasa (KM 651+718).\n\n"
        "The asset is the part of longest highway (NH-44) in India connecting Srinagar with "
        "Kanyakumari and passing through the cities of Jammu, Jalandhar, Delhi, Faridabad, Agra, "
        "Gwalior, Jhansi, Sagar, Nagpur, Hyderabad, Bengaluru and Salem. NH-44 is part of "
        "North-South corridor envisaged under National Highway Development Program (Phase – II).\n\n"
        "The road forms part of north-south long-distance strategic corridor and is present in the "
        "state of Madhya Pradesh closer to Maharashtra border. It lies between the urban centres of "
        "Jabalpur and Nagpur and has a divided section between Lakhnadon and Khawasa traversing "
        "through the districts of Mandai, Chhapara and Seoni in the state of Madhya Pradesh."
    ),
    "Bokhedi - Kelapur": (
        "A four-lane road on NH-44 with project length of 138.15 kms.\n\n"
        "The asset starts from south of Nagpur at Borkhedi (km 36+600), traversing through the "
        "districts of Nagpur, Wardha and Yavatmal in the state of Maharashtra and ends near "
        "Maharashtra/Telangana Border (km 175+000). The asset has two toll plazas at Darodha "
        "(km 92.500) and Kelapur (km 150.450). The toll plaza at Kelpaur is proposed to be shifted "
        "to km 156.650.\n\n"
        "The asset is in vicinity of Nagpur, which is home to several manufacturing hubs, food "
        "processing units and CONCOR’s multi modal logistics logistic hub. Yavatmal "
        "(textile/cotton), Butibori (MIDC), and Chandrapur (coal) are some of key traffic generators "
        "for the Asset."
    ),
}


# Project Inventory scope tables (Sr. No order), from the "Project Location" sheets.
PACKAGE_INVENTORY = {
    "Jabalpur - Lakhnadon": [
        ("Name of the Project", "Tolling, Operation, Maintenance & Transfer of four lane section from Jabalpur to "
         "Lakhnadon section of NH-30 (Km-880.600 to km. 891.780 and NH-34 (KM. 1358.000 to km. 1428.557) in the "
         "State of Madhya Pradesh."),
        ("Length of the Project", "81.737 kms (Four lane)"),
        ("Authority", "National Highways Authority of India (NHAI)"),
        ("Concessionaire", "NHIT Eastern Projects Private Limited (NEPPL)"),
        ("Location of Toll Plaza", "1. Boharipar (Km 1362+780 on NH-34)"),
        ("Pavement Type", "Flexible & Rigid (25% & 75%)"),
        ("Major & Minor Bridge", "02 & 24 Nos"),
        ("Flyover", "01 Nos"),
        ("Major Junction", "19 Nos"),
        ("Minor Junction", "98 Nos"),
        ("Underpass", "10 Nos"),
        ("Culverts", "165 Nos"),
    ],
    "Lakhnadon - Khawasa": [
        ("Name of the Project", "Tolling, Operation, Maintenance & Transfer of Lakhnadon-Mohagaon-Khawasa Section of "
         "NH-44 in the State of Madhya Pradesh (From Lakhnadon-Mohagaon-Khawasa Section existing Chainage starting "
         "from. 624+480 km to 653+770 km)."),
        ("Length of the Project", "107.350 km (29.29 kms Handover) Four lane"),
        ("Authority", "National Highways Authority of India (NHAI)"),
        ("Concessionaire", "NHIT Eastern Projects Private Limited (NEPPL)"),
        ("Location of Toll Plaza", "1. Madai Toll Plaza (Km 549+200 on NH-44),\n"
         "2. Khawasa Toll Plaza (Km 651+718 on NH-44)."),
        ("Pavement Type", "Rigid & Flexible (86% & 14%)"),
        ("Major & Minor Bridge", "01 & 10 Nos"),
        ("Major Junction", "01 Nos"),
        ("Minor Junction", "24 Nos"),
        ("Viaducts", "14 Nos"),
        ("Culverts", "39 Nos"),
    ],
    "Bokhedi - Kelapur": [
        ("Name of the Project", "Tolling, Operation, Maintenance & Transfer of Borkhedi\u2013Wadner\u2013Kelapur from "
         "km 36+600 to km 175+000 of NH-44 section in the state of Maharashtra."),
        ("Length of the Project", "138.40 kms (Four lane)"),
        ("Authority", "National Highways Authority of India (NHAI)"),
        ("Concessionaire", "NHIT Western Projects Private Limited (NWPPL)"),
        ("Location of Toll Plaza", "1. Daroda (Km 92+500 on NH-44),\n2. Kelapur (Km 150+000 on NH-44)."),
        ("Pavement Type", "Flexible"),
        ("Major & Minor Bridge", "08 & 59 Nos"),
        ("Flyover", "07 Nos"),
        ("Major Junction", "18 Nos"),
        ("Minor Junction", "274 Nos"),
        ("Underpass", "25 Nos"),
        ("Culverts", "136 Nos"),
    ],
}


# Inventory workbooks (visible sheets become Project Inventory tabs), in app/catalog/inventory/.
PACKAGE_INVENTORY_WORKBOOKS = {
    "Jabalpur - Lakhnadon": "jabalpur-lakhnadon.xlsx",
    "Lakhnadon - Khawasa": "lakhnadon-khawasa.xlsx",
    "Bokhedi - Kelapur": "bokhedi-kelapur.xlsx",
}


# Parties shown on RFI reports (Stage Payment Statement header); editable per project.
DEFAULT_PARTIES = {
    "authority": "National Highways Authority of India",
    "project_impl_authority": "National Highways InvIT Project Managers Private Limited",
    "gmc_name": "M/s Geo Design & Research Pvt. Ltd.",
}
PACKAGE_CONCESSIONAIRES = {
    "Jabalpur - Lakhnadon": "NHIT Eastern Projects Private Limited",
    "Lakhnadon - Khawasa": "NHIT Eastern Projects Private Limited",
    "Bokhedi - Kelapur": "NHIT Western Projects Private Limited",
}
