# Setup Guide — NEXORA AI

## Prerequisites

| Tool | Minimum Version | Check |
|------|----------------|-------|
| Node.js | 20.x LTS | `node --version` |
| npm | 9.x | `npm --version` |
| PostgreSQL | 15.x | `psql --version` |
| Docker + Docker Compose | 24.x / 2.x | `docker --version` (optional — simplest DB setup) |
| Git | 2.x | `git --version` |

---

## Environment Variables

Copy `.env.example` to `.env` and set these values:

### Required

| Variable | Example | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `4000` | Backend API port |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |
| `JWT_SECRET` | *(64+ random chars)* | Token signing secret — **change before deploy** |
| `JWT_EXPIRY` | `8h` | Token expiry duration |
| `DATABASE_URL` | `postgresql://nexora:nexora_pass@localhost:5432/nexora_ai` | Full DB connection string |
| `DB_HOST` | `localhost` | DB host (used alongside DATABASE_URL) |
| `DB_PORT` | `5432` | DB port |
| `DB_NAME` | `nexora_ai` | Database name |
| `DB_USER` | `nexora` | DB user |
| `DB_PASSWORD` | `nexora_pass` | DB password |
| `BCRYPT_ROUNDS` | `12` | Password hash rounds (≥12 in production) |

### Optional — External Services (app works without all of these)

| Variable | Description | Fallback |
|----------|-------------|---------|
| `WATSONX_API_KEY` | IBM watsonx.ai API key | Rule-based triage summary |
| `WATSONX_URL` | watsonx endpoint (e.g. `https://us-south.ml.cloud.ibm.com`) | Rule-based triage summary |
| `WATSONX_PROJECT_ID` | watsonx project ID | Rule-based triage summary |
| `WEATHER_API_KEY` | OpenWeatherMap API key | Seeded mock weather records |
| `WEATHER_API_BASE_URL` | OWM base URL | `https://api.openweathermap.org/data/2.5` |
| `SMTP_HOST` | Email SMTP host | Console log |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | Console log |
| `SMTP_PASS` | SMTP password | Console log |
| `EMAIL_FROM` | Sender address | `noreply@nexora-ai.in` |
| `TWILIO_ACCOUNT_SID` | Twilio SID | Console log |
| `TWILIO_AUTH_TOKEN` | Twilio token | Console log |
| `TWILIO_FROM_NUMBER` | Twilio phone number | Console log |
| `IBM_COS_ENDPOINT` | IBM COS endpoint | Local disk (`uploads/`) |
| `IBM_COS_API_KEY` | IBM COS API key | Local disk |
| `IBM_COS_BUCKET` | IBM COS bucket name | Local disk |
| `IBM_COS_SERVICE_INSTANCE_ID` | IBM COS CRN | Local disk |
| `STORAGE_PROVIDER` | `ibm_cos` to enable COS | `local` |
| `REDIS_URL` | Redis connection URL | Not required for basic operation |
| `MAPBOX_TOKEN` | Mapbox GL token | OpenStreetMap / Leaflet |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `900000` (15 min) |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `MAX_UPLOAD_SIZE_MB` | Max file upload size | `10` |
| `TOTP_ISSUER` | 2FA issuer name | `NEXORA_AI` |

---

## Option A — Docker (Recommended, fastest)

### Step 1 — Clone

```bash
git clone https://github.com/mitesh1502/bob-ai-hackathon-civilgrid.git
cd bob-ai-hackathon-civilgrid
```

### Step 2 — Start PostgreSQL

```bash
docker compose up -d
# Starts postgis/postgis:15-3.3 on port 5432
# pgAdmin available at http://localhost:5050 (admin@nexora.ai / nexora_admin)
```

Verify it started:
```bash
docker compose ps
# nexora_postgres should show "healthy"
```

### Step 3 — Install dependencies

```bash
npm install
```

### Step 4 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:
```env
JWT_SECRET=replace_with_at_least_64_random_characters_here_change_me_now
DATABASE_URL=postgresql://nexora:nexora_pass@localhost:5432/nexora_ai
```

The default `DATABASE_URL` matches the Docker Compose postgres credentials — no change needed if using Docker.

### Step 5 — Run migrations

```bash
npm run migrate
```

This applies 4 migrations in order:
- `001_initial_schema.sql` — full schema (states, assets, risk, maintenance, workers, complaints, audit)
- `002_talukas_villages.sql` — talukas, villages, FK columns
- `003_risk_predictions_updated_at.sql` — adds `updated_at` trigger
- `004_alert_module.sql` — alert management module (12 enums, 18 tables)

### Step 6 — Seed data

```bash
# Base data: users, assets, sensor readings, weather, risk predictions
npm run seed

# Gujarat end-to-end demo scenario (ALT-GJ-DEMO-001)
npm run seed:demo
```

### Step 7 — Start dev servers

```bash
npm run dev
# Starts backend on :4000 and frontend on :3000 concurrently
```

### Step 8 — Verify it works

```bash
# Backend health check
curl http://localhost:4000/health
# Expected: {"status":"ok","service":"NEXORA AI Backend","version":"1.0.0"}

# Open frontend
open http://localhost:3000
```

---

## Option B — Existing PostgreSQL (no Docker)

```bash
# Create DB user and database
psql -U postgres -c "CREATE USER nexora WITH PASSWORD 'nexora_pass';"
psql -U postgres -c "CREATE DATABASE nexora_ai OWNER nexora;"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Clone + install
git clone https://github.com/mitesh1502/bob-ai-hackathon-civilgrid.git
cd bob-ai-hackathon-civilgrid
npm install

# Configure
cp .env.example .env
# Edit .env — set JWT_SECRET and DATABASE_URL to point at your PostgreSQL

# Migrate + seed
npm run migrate
npm run seed
npm run seed:demo

# Start
npm run dev
```

---

## Demo Accounts

After seeding, use these accounts at **http://localhost:3000/login**:

| Role | Email | Password | What you can see |
|------|-------|----------|-----------------|
| Super Admin | superadmin@nexora.ai | Admin@1234! | National view — all states, all data |
| State Admin (MH) | admin.mh@nexora.ai | MhAdmin@123! | Maharashtra data only |
| State Admin (KL) | admin.kl@nexora.ai | KlAdmin@123! | Kerala data only |
| State Admin (GJ) | admin.gj@nexora.ai | GjAdmin@123! | Gujarat data + demo alert |
| Field Worker | worker.kumar@nexora.ai | Worker@1234! | Own tasks and alerts only |
| Field Worker (GJ) | arjun.patel@nexora.ai | Worker@1234! | Gujarat demo alert assigned |

---

## Key Demo Workflows

1. **Risk Dashboard** — Login as Super Admin → `/admin/dashboard` — national risk heatmap, weather alerts
2. **Asset Detail + Risk Breakdown** — Click any asset → see 7-factor score with named contributions
3. **Maintenance Queue** — `/admin/maintenance` — Priority = risk×0.4 + grid_impact×0.3 + failure_prob×0.2 + urgency×0.1
4. **Gujarat Alert** — Login as `admin.gj@nexora.ai` → `/state/alerts` → open `ALT-GJ-DEMO-001` → all 5 tabs
5. **IBM Bob Triage** — In alert detail → Risk Score tab → click "Ask IBM Bob" (requires watsonx credentials or uses fallback)
6. **Worker Flow** — Login as `arjun.patel@nexora.ai` → `/worker/alerts` → open the Gujarat alert
7. **GIS Map** — `/admin/map` — Leaflet map with all assets color-coded by risk level
8. **Crew Pre-Positioning** — `/admin/crew` — weather-triggered crew staging recommendations

---

## Production Build

```bash
npm run build
# Compiles TypeScript for backend, builds Vite bundle for frontend

# Start backend
cd packages/backend && NODE_ENV=production node dist/server.js

# Serve frontend dist/ via nginx or CDN
# packages/frontend/dist/ is the build output
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Missing required environment variable: JWT_SECRET` | `.env` not created or empty | `cp .env.example .env` and set `JWT_SECRET` |
| `Connection refused :5432` | PostgreSQL not running | `docker compose up -d` or start local PostgreSQL |
| `relation "states" does not exist` | Migrations not run | `npm run migrate` |
| `duplicate key value` on seed | Seed already ran | Safe — all inserts use `ON CONFLICT DO NOTHING` |
| `ERROR: extension "postgis" does not exist` | PostGIS not installed | Use `postgis/postgis:15-3.3` Docker image, or `sudo apt install postgresql-15-postgis-3` |
| Frontend shows blank page | Backend not running | Ensure `npm run dev` started both servers; check `:4000/health` |
| `Cannot find module '../../lib/api'` | Stale build | Run `npm run build` fresh; path issue was fixed in this submission |
| watsonx triage returns fallback | `WATSONX_API_KEY` not set | Set the three `WATSONX_*` vars in `.env`; fallback is the rule-based engine (same shape) |
| Port 3000 / 4000 already in use | Another process on the port | Change `PORT=4001` in `.env` and `VITE_API_URL` in frontend `.env` |
