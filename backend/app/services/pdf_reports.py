"""Single-record PDF reports (issue / RFI / query) with photos."""

from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

import httpx
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.config import settings

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")
_NAVY = colors.HexColor("#1e3a5f")
_STYLES = getSampleStyleSheet()
_CELL = ParagraphStyle("cell", parent=_STYLES["Normal"], fontSize=9, leading=12)
_CELL_B = ParagraphStyle("cellb", parent=_CELL, fontName="Helvetica-Bold")
_SMALL = ParagraphStyle("small", parent=_STYLES["Normal"], fontSize=8, textColor=colors.grey)


def fmt(value) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y, %H:%M")
    if isinstance(value, date):
        return value.strftime("%d %b %Y")
    if hasattr(value, "value"):  # enums
        return label(value.value)
    return str(value)


def label(code: str | None) -> str:
    """Status / priority code → "In progress"."""
    return code.replace("_", " ").capitalize() if code else "—"


def _p(text, style=_CELL) -> Paragraph:
    return Paragraph(escape(fmt(text)).replace("\n", "<br/>"), style)


def is_image(path: str | None) -> bool:
    if not path:
        return False
    clean = path.split("?")[0].lower()
    return clean.endswith(IMAGE_EXTS) or "/image/upload/" in clean


async def fetch_images(paths: list[str | None]) -> dict[str, bytes]:
    """Load photo bytes from Cloudinary URLs or the local uploads dir; skip failures."""
    out: dict[str, bytes] = {}
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        for path in paths:
            if not path or path in out or not is_image(path):
                continue
            try:
                if path.startswith(("http://", "https://")):
                    res = await client.get(path)
                    if res.status_code == 200:
                        out[path] = res.content
                else:
                    local = Path(settings.upload_dir) / Path(path).name
                    if local.is_file():
                        out[path] = local.read_bytes()
            except Exception:  # noqa: BLE001 — a missing photo must not break the report
                continue
    return out


def _image(data: bytes, max_w: float, max_h: float):
    try:
        reader = ImageReader(BytesIO(data))
        w, h = reader.getSize()
        scale = min(max_w / w, max_h / h, 1.0)
        return Image(BytesIO(data), width=w * scale, height=h * scale)
    except Exception:  # noqa: BLE001
        return _p("Photo could not be rendered", _SMALL)


def _kv_table(rows: list[tuple[str, object]], width: float) -> Table:
    data = [[_p(k, _CELL_B), _p(v)] for k, v in rows]
    t = Table(data, colWidths=[width * 0.3, width * 0.7])
    t.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    return t


def _grid_table(header: list[str], rows: list[list[object]], width: float) -> Table:
    data = [[_p(h, ParagraphStyle("h", parent=_CELL_B, textColor=colors.white)) for h in header]]
    data += [[_p(c) for c in r] for r in rows]
    t = Table(data, colWidths=[width / len(header)] * len(header), repeatRows=1)
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), _NAVY),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    return t


def build_record_pdf(
    *,
    title: str,
    subtitle: str | None,
    fields: list[tuple[str, object]],
    sections: list[tuple[str, list[str], list[list[object]]]] = (),
    notes: list[tuple[str, str | None]] = (),
    photos: list[tuple[str, str | None, str | None]] = (),
    images: dict[str, bytes] | None = None,
) -> bytes:
    """fields: key/value rows; sections: (heading, header, rows); notes: (heading, text);
    photos: (label, path, caption)."""
    images = images or {}
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
        title=title,
    )
    width = doc.width
    story: list = [Paragraph(escape(title), _STYLES["Title"])]
    if subtitle:
        story.append(Paragraph(escape(subtitle), ParagraphStyle("sub", parent=_CELL, alignment=1)))
    story += [
        Paragraph(f"Generated {datetime.now().strftime('%d %b %Y, %H:%M')} · RoadService", ParagraphStyle(
            "gen", parent=_SMALL, alignment=1)),
        Spacer(1, 10),
        _kv_table(fields, width),
    ]
    for heading, text in notes:
        if text:
            story += [Spacer(1, 10), Paragraph(escape(heading), _STYLES["Heading3"]), _p(text)]
    for heading, header, rows in sections:
        if rows:
            story += [Spacer(1, 10), Paragraph(escape(heading), _STYLES["Heading3"]), _grid_table(header, rows, width)]
    shown = [(label, path, cap) for label, path, cap in photos if path]
    if shown:
        story += [Spacer(1, 10), Paragraph("Photos", _STYLES["Heading3"])]
        for label, path, cap in shown:
            block = [Paragraph(escape(label), _CELL_B)]
            if path in images:
                block.append(_image(images[path], width, 95 * mm))
            elif is_image(path):
                block.append(_p("Photo unavailable", _SMALL))
            else:
                block.append(_p(f"Attachment: {path}", _SMALL))
            if cap:
                block.append(_p(cap, _SMALL))
            block.append(Spacer(1, 8))
            story.append(KeepTogether(block))
    doc.build(story)
    return buf.getvalue()


def pdf_response(content: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
