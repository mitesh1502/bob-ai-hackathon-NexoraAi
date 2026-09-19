# NEXORA AI — Deployment & Setup Guide

## Overview

NEXORA AI is a monorepo with three packages:
- `packages/backend` — Node.js/TypeScript REST API
- `packages/frontend` — React/TypeScript SPA (Vite)
- `packages/shared` — Shared types

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ with PostGIS extension
- (Optional) Redis for caching/sessions

---

## 1. Clone & Install

```bash
git clone <repo-url>
cd nexora-ai
npm install
```

---

## 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum, set:
```
DATABASE_URL=postgresql://nexora:your_pass@localhost:5432/nexora_ai
JWT_SECRET=<64+ random characters>
```

All external service credentials are optional — the app uses clearly-labeled mock data
when a service is not configured. See `.env.example` for all options.

---

## 3. Database Setup

### Create the database

```sql
CREATE USER nexora WITH PASSWORD 'nexora_pass';
CREATE DATABASE nexora_ai OWNER nexora;
\c nexora_ai
CREATE EXTENSION postgis;
CREATE EXTENSION "uuid-ossp";
CREATE EXTENSION pgcrypto;
```

### Run migrations

```bash
npm run migrate
```

### Seed test data

```bash
npm run seed
```

This creates:
- 1 Super Admin: `superadmin@nexora.ai` / `Admin@1234!`
- State Admin (Maharashtra): `admin.mh@nexora.ai` / `MhAdmin@123!`
- State Admin (Kerala): `admin.kl@nexora.ai` / `KlAdmin@123!`
- Workers: `worker.kumar@nexora.ai`, `worker.priya@nexora.ai`, `worker.mohan@nexora.ai` / `Worker@1234!`
- Sample assets, complaints, observations, weather data
- Complete risk prediction demonstrations

---

## 4. Development

```bash
# Backend (port 4000)
npm run dev:backend

# Frontend (port 3000)
npm run dev:frontend

# Both together
npm run dev
```

---

## 5. Production Build

```bash
npm run build
```

### Start production server

```bash
cd packages/backend
NODE_ENV=production node dist/server.js
```

Serve `packages/frontend/dist` with nginx or a CDN.

---

## 6. IBM Cloud Deployment

### Cloud Foundry

```yaml
# manifest.yml
applications:
  - name: nexora-ai
    buildpack: nodejs_buildpack
    command: node packages/backend/dist/server.js
    memory: 512M
    env:
      NODE_ENV: production
      DATABASE_URL: ((DATABASE_URL))
      JWT_SECRET: ((JWT_SECRET))
```

```bash
ibmcloud cf push
ibmcloud cf set-env nexora-ai DATABASE_URL "postgresql://..."
```

### IBM Code Engine

```bash
ibmcloud ce application create \
  --name nexora-ai \
  --image icr.io/your-namespace/nexora-ai:latest \
  --env-from-secret nexora-secrets
```

---

## 7. Enabling External Services

### Mapbox (maps)
Set `MAPBOX_TOKEN=pk.your_mapbox_token` in `.env`.
Without this, the map uses OpenStreetMap (Leaflet) — fully functional.

### Weather (OpenWeatherMap)
Set `WEATHER_API_KEY=your_key` and `WEATHER_API_BASE_URL`.
Without this, realistic mock weather data is shown.

### Email (SMTP)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`.
Without this, notifications are logged to console.

### SMS (Twilio)
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
Without this, SMS notifications are logged to console.

### File Storage (IBM Cloud Object Storage)
Set `IBM_COS_ENDPOINT`, `IBM_COS_API_KEY`, `IBM_COS_BUCKET`, `IBM_COS_SERVICE_INSTANCE_ID`.
Without this, files are stored locally in `uploads/`.

### AI/Analytics (watsonx)
Set `WATSONX_API_KEY`, `WATSONX_URL`, `WATSONX_PROJECT_ID`.
Without this, the built-in rule-based risk engine is used (fully functional).

---

## 8. India GIS Boundaries

To add real state/district boundaries:
1. Download India boundary GeoJSON from [datameet/maps](https://github.com/datameet/maps)
2. Import using PostGIS:
```sql
UPDATE states SET boundary = ST_GeomFromGeoJSON('...') WHERE code = 'MH';
```
Or use ogr2ogr to bulk import shapefiles.

---

## 9. Security Checklist

- [ ] Change all `.env` secrets before deployment
- [ ] `JWT_SECRET` must be 64+ random characters
- [ ] `BCRYPT_ROUNDS` should be ≥12 in production
- [ ] Enable HTTPS (TLS termination at load balancer or nginx)
- [ ] Set `ALLOWED_UPLOAD_TYPES` to restrict file types
- [ ] Configure `MAX_UPLOAD_SIZE_MB` appropriately
- [ ] Review `RATE_LIMIT_MAX` for your expected traffic
- [ ] Ensure PostgreSQL is not publicly accessible
- [ ] Never set `NODE_ENV=development` in production

---

## 10. Data Isolation Testing

The system enforces state-level isolation on every API endpoint. Test with:

```bash
# Login as KL state admin, then attempt to access MH data
curl -H "Authorization: Bearer <KL_TOKEN>" \
  "http://localhost:4000/api/assets?stateId=<MH_STATE_ID>"
# Should return 403 Forbidden
```

All state admin endpoints enforce `record.state_id === user.stateId` in the database query,
not just the UI.

---

## 11. API Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | Public | Login (all roles) |
| `/api/workers/register` | POST | Public | Worker registration |
| `/api/complaints` | POST | Public | Submit complaint (with GPS photo) |
| `/api/complaints/track/:number` | GET | Public | Track complaint by number |
| `/api/citizens/states` | GET | Public | List states |
| `/api/citizens/districts/:id` | GET | Public | List districts |
| `/api/assets` | GET | Admin | List assets |
| `/api/risk/:id/compute` | POST | Admin | Recompute risk for asset |
| `/api/risk/:id/latest` | GET | Admin | Latest prediction |
| `/api/maintenance/priority-queue` | GET | Admin | Priority maintenance queue |
| `/api/dashboard/super-admin` | GET | Super Admin | National dashboard data |
| `/api/dashboard/state-admin` | GET | State Admin | State dashboard data |
| `/api/dashboard/worker` | GET | Worker | Worker dashboard data |
| `/api/gis/assets` | GET | Admin | Assets GeoJSON |
| `/api/gis/complaints` | GET | Admin | Complaints GeoJSON |
| `/api/inspections/tasks/my` | GET | Worker | My assigned tasks |
| `/api/inspections/reports` | POST | Worker | Submit inspection report |

---

## 12. Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  Landing │ Login │ Register │ Complaint │ Dashboard  │
└───────────────────────┬─────────────────────────────┘
                        │ REST API (/api/*)
┌───────────────────────▼─────────────────────────────┐
│              Node.js Express Backend                 │
│  Auth  │ Workers  │ Assets  │ GIS  │ Risk Engine    │
│  Inspections │ Maintenance │ Notifications          │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│       PostgreSQL + PostGIS Database                  │
│  States/Districts │ Assets │ Workers │ Complaints   │
│  Observations │ Risk Predictions │ Audit Logs       │
└─────────────────────────────────────────────────────┘
         │            │           │
   ┌─────▼──┐  ┌──────▼────┐  ┌──▼──────────┐
   │Weather │  │ Storage   │  │ Email / SMS  │
   │  API   │  │(IBM COS / │  │(SMTP/Twilio  │
   │(OWM or │  │ local)    │  │ or mock)     │
   │ mock)  │  └───────────┘  └─────────────┘
   └────────┘
```
