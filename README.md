# RoadService

Road Issue Management System — report, track, and resolve road maintenance issues across Government, Admin, Contractor, and Surveyor roles.

## Stack

- **API:** FastAPI + SQLAlchemy + Alembic + PostgreSQL (Neon via `DATABASE_URL`)
- **Web:** Django templates + HTMX (thin FastAPI client)
- **Mobile:** React Native (Expo) — Surveyor & Contractor flows
- **Jobs:** APScheduler — 24h Completed → Verification Pending

## Quick start

### 1. Environment

```bash
cp .env.example .env
# Set DATABASE_URL to your Neon connection string (asyncpg):
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
python -m app.seed   # optional demo users
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### 3. Django web

```bash
cd web
python -m venv .venv
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8001
```

### 4. Mobile (Expo)

```bash
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to your FastAPI base URL.

## Default seed users (after `python -m app.seed`)

| Email | Password | Role |
|-------|----------|------|
| admin@roadservice.local | Admin123! | admin |
| gov@roadservice.local | Gov123! | government |
| contractor@roadservice.local | Contractor123! | contractor |
| surveyor@roadservice.local | Surveyor123! | surveyor |

## Repo layout

```
backend/   FastAPI API, models, migrations, scheduler, exports
web/       Django dashboards (consumes FastAPI)
mobile/    React Native / Expo apps
PROJECT_SPEC.md
```
