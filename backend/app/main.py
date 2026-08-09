from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import analytics, auth, billing, catalog, issues, notifications, portal, projects, rates, users
from app.core.config import settings
from app.jobs.verification import (
    flip_stale_completed_to_verification_pending,
    warn_approaching_verification_deadline,
)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
uploads = Path(settings.upload_dir)
uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads)), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok"}
