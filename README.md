# RoadService

Road Issue Management System — report, track, and resolve road maintenance issues across Government, Admin, Contractor, and Surveyor roles.

## Stack

| Layer | Tech |
|-------|------|
| API | FastAPI + SQLAlchemy + Alembic + PostgreSQL (Neon via `DATABASE_URL`) |
| Web | **React (Vite + TypeScript)** — thin FastAPI client |
| Mobile | **React Native (Expo)** — Surveyor & Contractor |
| Photos | **Cloudinary** (`CLOUDINARY_*` in `.env`) |
| Jobs | APScheduler — 24h Completed → Verification Pending |

Issue types come from the client defect sheets (ATMS-1…, S1…, letter codes). See `GET /api/v1/catalog/defects`.

## Quick start

### 1. Environment

```bash
cp .env.example .env
# Set Neon URLs:
# DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
# DATABASE_URL_SYNC=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
```

### 2. FastAPI backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 3. React web

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

Open http://127.0.0.1:5173

### 4. React Native (Expo)

```bash
cd mobile
cp .env.example .env
# On a physical device, set EXPO_PUBLIC_API_URL to your LAN IP, e.g. http://192.168.1.10:8000
npm install
npx expo start
```

## Roles

| Role | Web | Mobile |
|------|-----|--------|
| Government | View-only dashboard | — |
| Admin | Full control | — |
| Contractor | Dashboard + start work | Complete / rework flows |
| Surveyor | — (blocked on web login) | Create + verify issues |

## Seed users

| Email | Password | Role |
|-------|----------|------|
| admin@roadservice.app | Admin123! | admin |
| gov@roadservice.app | Gov123! | government |
| contractor@roadservice.app | Contractor123! | contractor |
| surveyor@roadservice.app | Surveyor123! | surveyor |

## Layout

```
backend/   FastAPI API, models, migrations, scheduler, exports
web/       React (Vite) dashboards
mobile/    React Native / Expo apps
PROJECT_SPEC.md
```
