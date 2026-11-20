import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    analytics,
    auth,
    billing,
    catalog,
    issues,
    notifications,
    nhit,
    portal,
    projects,
    queries,
    rates,
    rfis,
    field_ops,
    staff_details,
    toll_perf,
    users,
)
from app.core.config import settings
from app.core.schema_guard import ensure_schema
from app.jobs.verification import (
    flip_stale_completed_to_verification_pending,
    warn_approaching_verification_deadline,
)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    await ensure_schema()
    from app.services.storage import ensure_file_table

    await ensure_file_table()
    if settings.scheduler_enabled:
        scheduler.add_job(
            flip_stale_completed_to_verification_pending,
            "interval",
            minutes=15,
            id="verification_pending_flip",
            replace_existing=True,
        )
        scheduler.add_job(
            warn_approaching_verification_deadline,
            "interval",
            minutes=15,
            id="verification_due_soon",
            replace_existing=True,
        )
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="Road Issue Management API",
    version="0.1.0",
    lifespan=lifespan,
)



# Registered before CORSMiddleware so it runs *inside* it: unhandled errors become
# JSON 500s that still carry CORS headers, instead of a misleading browser CORS error.
@app.middleware("http")
async def json_server_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("app").exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": f"Server error: {exc}"})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(issues.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(catalog.router, prefix="/api/v1")
app.include_router(rates.router, prefix="/api/v1")
app.include_router(billing.router, prefix="/api/v1")
app.include_router(portal.docs_router, prefix="/api/v1")
app.include_router(portal.vendors_router, prefix="/api/v1")
app.include_router(portal.mpr_router, prefix="/api/v1")
app.include_router(staff_details.router, prefix="/api/v1")
app.include_router(queries.router, prefix="/api/v1")
app.include_router(rfis.router, prefix="/api/v1")
app.include_router(field_ops.router, prefix="/api/v1")
app.include_router(nhit.router, prefix="/api/v1")
app.include_router(toll_perf.router, prefix="/api/v1/nhit")
uploads = Path(settings.upload_dir)
uploads.mkdir(parents=True, exist_ok=True)


@app.get("/uploads/{name}")
async def serve_upload(name: str):
    """Uploaded files: from disk when present, else from the database copy (Render's disk is
    wiped on each deploy). The database copy is written back to disk as a cache."""
    import mimetypes

    from fastapi import HTTPException
    from fastapi.responses import FileResponse, Response

    from app.services.storage import load_file

    if "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=404, detail="Not found")
    path = uploads / name
    if path.is_file():
        return FileResponse(path)
    content = await load_file(name)
    if content is None:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        path.write_bytes(content)
    except OSError:
        pass
    media = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return Response(content, media_type=media, headers={"Cache-Control": "public, max-age=86400"})


@app.get("/health")
async def health():
    return {"status": "ok"}
