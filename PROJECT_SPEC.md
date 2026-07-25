# Road Issue Management System — Project Spec

Multi-role platform for reporting, tracking, and resolving road maintenance issues
(potholes, damaged roads, broken drainage, encroachments, etc.).

## Architecture

| Service | Role |
|---------|------|
| **FastAPI** (`backend/`) | Source of truth — models, auth, business logic, status machine, exports, jobs |
| **React** (`web/`) | Web UI (Vite + TypeScript); calls FastAPI over HTTP |
| **React Native** (`mobile/`) | Contractor + Surveyor apps; same FastAPI API |
| **PostgreSQL (Neon)** | Database via `DATABASE_URL` |

Do **not** put business logic in the React or React Native clients. Web and mobile share one API.

## Roles

| Role | Platform |
|------|----------|
| Government | Web (view-only — enforced at API) |
| Admin | Web (full control) |
| Contractor | Web + Mobile |
| Surveyor | Mobile only |

## Issue status machine

```
Open → In Progress → Completed → Closed
                              ↘ Verification Pending (auto after 24h)
                              ↘ Under Review / Rework Required → In Progress (loop)
```

Valid transitions are enforced in FastAPI (`IssueStatus` + transition map).

## Core entities

- **User** — role, active/inactive
- **Project** — name, location, assigned contractors/surveyors
- **Issue** — type, work category, photos + GPS (before/completion/verification), deadlines, assignees, audit trail
- **Notification** — assignment, completion, verification reminders

## Photo rules

Camera-only capture on mobile (no gallery). GPS lat/lng recorded at capture time.

## Open questions (confirm with client)

1. Exact Issue Types / Work Categories lists
2. Photo storage: S3 vs local (default: local `UPLOAD_DIR`)
3. Notifications: FCM / SMS / email
