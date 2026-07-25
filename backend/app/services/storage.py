from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import aiofiles
import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile

from app.core.config import settings


def _configure_cloudinary() -> None:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


async def save_upload(file: UploadFile, prefix: str) -> str:
    """Upload photo to Cloudinary (preferred) or local uploads/ fallback. Returns URL or filename."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty photo upload")

    if settings.cloudinary_enabled:
        _configure_cloudinary()
        public_id = f"roadservice/{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        try:
            result = cloudinary.uploader.upload(
                BytesIO(content),
                public_id=public_id,
                resource_type="image",
                overwrite=True,
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Cloudinary upload failed: {exc}") from exc
        url = result.get("secure_url") or result.get("url")
        if not url:
            raise HTTPException(status_code=502, detail="Cloudinary returned no URL")
        return url

    upload_root = Path(settings.upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "photo.jpg").suffix or ".jpg"
    name = f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{ext}"
    path = upload_root / name
    async with aiofiles.open(path, "wb") as out:
        await out.write(content)
    return name
