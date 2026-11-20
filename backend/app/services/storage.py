from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

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


def _save_local(content: bytes, prefix: str, filename: str = "photo.jpg") -> str:
    upload_root = Path(settings.upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix or ".jpg"
    name = f"{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{ext}"
    path = upload_root / name
    path.write_bytes(content)
    return name


def _upload_bytes(content: bytes, prefix: str, filename: str = "photo.jpg") -> str:
    if settings.cloudinary_enabled:
        _configure_cloudinary()
        public_id = f"roadservice/{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        try:
            result = cloudinary.uploader.upload(
                BytesIO(content),
                public_id=public_id,
                resource_type="auto",
                overwrite=True,
            )
            url = result.get("secure_url") or result.get("url")
            if url:
                return url
        except Exception as exc:  # noqa: BLE001
            # Invalid API secret / network — keep the app usable with local files
            print(f"Cloudinary upload failed, using local storage: {exc}")

    return _save_local(content, prefix, filename)


async def save_upload(file: UploadFile, prefix: str) -> str:
    """Upload photo to Cloudinary (preferred) or local uploads/ fallback. Returns URL or filename."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty photo upload")
    name = _upload_bytes(content, prefix, file.filename or "photo.jpg")
    if not name.startswith(("http://", "https://")):
        # Render's disk is wiped on every deploy: keep a copy in the database so the file
        # can still be shown later (served by GET /uploads/{name}).
        await persist_file(name, content)
    return name


_STORED_FILES_DDL = (
    "CREATE TABLE IF NOT EXISTS stored_files ("
    "name VARCHAR(512) PRIMARY KEY, content BYTEA NOT NULL, "
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
)


async def ensure_file_table() -> None:
    from sqlalchemy import text

    from app.core.database import engine

    try:
        async with engine.begin() as conn:
            await conn.execute(text(_STORED_FILES_DDL))
    except Exception as exc:  # noqa: BLE001
        print(f"stored_files table check failed: {exc}")


async def persist_file(name: str, content: bytes) -> None:
    from sqlalchemy import text

    from app.core.database import engine

    try:
        async with engine.begin() as conn:
            await conn.execute(text(_STORED_FILES_DDL))
            await conn.execute(
                text("INSERT INTO stored_files (name, content) VALUES (:n, :c) ON CONFLICT (name) DO NOTHING"),
                {"n": name, "c": content},
            )
    except Exception as exc:  # noqa: BLE001
        print(f"Could not keep a database copy of {name}: {exc}")


async def load_file(name: str) -> bytes | None:
    from sqlalchemy import text

    from app.core.database import engine

    try:
        async with engine.connect() as conn:
            return (
                await conn.execute(text("SELECT content FROM stored_files WHERE name = :n"), {"n": name})
            ).scalar()
    except Exception:  # noqa: BLE001
        return None


def upload_from_url(url: str, prefix: str) -> str:
    """Download a remote image and store on Cloudinary / local uploads.

    Falls back to storing the original remote URL if Cloudinary credentials fail.
    """
    import ssl
    import urllib.request

    content: bytes | None = None
    ctx = ssl._create_unverified_context()  # noqa: S323
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:  # noqa: S310
            content = resp.read()
    except Exception:
        content = None

    if content:
        try:
            return _upload_bytes(content, prefix, "remote.jpg")
        except Exception as exc:  # noqa: BLE001
            print(f"    Cloudinary byte upload failed: {exc}")

    if settings.cloudinary_enabled:
        _configure_cloudinary()
        public_id = f"roadservice/{prefix}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        try:
            result = cloudinary.uploader.upload(
                url,
                public_id=public_id,
                resource_type="image",
                overwrite=True,
            )
            out = result.get("secure_url") or result.get("url")
            if out:
                return out
        except Exception as exc:  # noqa: BLE001
            print(f"    Cloudinary URL upload failed: {exc}")

    # Last resort: keep the remote URL so the UI still shows photos
    return url
