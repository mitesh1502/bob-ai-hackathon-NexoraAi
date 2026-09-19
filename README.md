# NEXORA AI

**Intelligent Power Grid Alert Management & Predictive Maintenance Platform**

> IBM Bob AI Hackathon — Track U1: Utilities

---

## Team

| Name | Role | GitHub |
|------|------|--------|
| Mitesh Patel | Full-Stack Lead — Backend API, Risk Engine, DB Schema, Frontend | [@mitesh1502](https://github.com/mitesh1502) |

---

## Problem Statement

India's power distribution utilities lose millions of dollars per hour during unplanned outages, yet over 70% still operate on rigid calendar-based maintenance schedules that ignore real-time sensor telemetry, live weather forecasts, and asset-level failure history. When a transformer running at 95% load during a monsoon storm fails at 2 AM, field crews are scrambling reactively rather than already pre-positioned. The U1 challenge demands a system that ingests all three signal streams — IoT sensors, weather APIs, historical incidents — to produce explainable, ranked risk scores and drive a proactive maintenance and crew pre-positioning workflow with full audit governance.

---

## Solution

NEXORA AI is a full-stack TypeScript + PostgreSQL platform with two interlocking risk engines. The **7-factor Risk Engine (v1.0.0)** scores every grid asset 0–100 using sensor readings, weather alerts, historical incidents, asset age, load ratio, worker observations, and geographic exposure — each factor named with its contribution. The **11-step Alert Risk Pipeline (v2.0.0)** manages citizen-reported and field-detected incidents end-to-end: from creation through 6-tier worker assignment, GPS-verified arrival, structured field findings, corrective action, and admin-approved closure. IBM Bob (watsonx.ai) is integrated as an alert triage assistant that reads the alert context and returns a plain-English summary with recommended action.

---

## Key Features

| # | Feature | Where in code |
|---|---------|--------------|
| 1 | **7-factor explainable risk engine** — sensor + weather + history + age + load + geographic + observations, each factor cited by name with its numeric contribution | `packages/backend/src/services/riskEngine.ts` |
| 2 | **11-step Alert Risk Pipeline** — 22-state lifecycle with safety override floor: critical conditions (exposed wiring, fire, structural damage) pin risk ≥ 75 regardless of positive findings | `packages/backend/src/services/alertRiskPipeline.ts` |
| 3 | **6-tier worker assignment engine** — same village → same taluka → nearby district → in-state fallback → cross-state (Super Admin auth), with Haversine travel estimates and scoring reasons stored as JSONB | `packages/backend/src/services/alertAssignmentService.ts` |
| 4 | **GPS-verified field arrival** — mismatch warning at > 200 m, EXIF GPS extraction from images, SHA-256 tamper hash per image, required category tracker (arrival + close_up_problem) | `packages/backend/src/routes/alerts.ts`, `packages/frontend/src/components/GeoTaggedImageUpload.tsx` |
| 5 | **IBM Bob / watsonx triage** — `POST /api/bob/triage` sends alert context to `ibm/granite-13b-chat-v2`, returns structured summary + recommended action + urgency level; graceful fallback to rule-based summary | `packages/backend/src/routes/bob.ts`, `packages/backend/src/services/bobService.ts` |
| 6 | **Maintenance Priority Queue** — `Priority = risk×0.4 + grid_impact×0.3 + failure_prob×0.2 + urgency×0.1`, admin approve/reject/override with mandatory written reason | `packages/backend/src/routes/maintenance.ts` |
| 7 | **State-level data isolation** — every DB query filters by `state_id = user.stateId`; workers see only their own data; full tamper-evident audit trail on every status transition | `packages/backend/src/middleware/auth.ts` |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js 20, TypeScript 5.3, Express 4, PostgreSQL 15 + PostGIS, JWT, bcryptjs, multer, zod, winston |
| **Frontend** | React 18, TypeScript 5.3, Vite 5, Tailwind CSS 3, react-query, react-hook-form, recharts, Leaflet |
| **Database** | PostgreSQL 15, uuid-ossp, pgcrypto; 4 migrations; 36-state India geographic hierarchy |
| **AI / ML** | Rule-based risk engines (v1.0.0 + v2.0.0); IBM watsonx.ai `granite-13b-chat-v2` for alert triage |
| **Deployment** | Docker Compose (postgis:15-3.3 + pgAdmin); IBM Cloud Foundry / Code Engine ready |

---

## How to Run

### Option A — Docker (fastest)

```bash
git clone https://github.com/mitesh1502/bob-ai-hackathon-NexoraAi.git
cd bob-ai-hackathon-NexoraAi

# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set JWT_SECRET to any 64+ char string (DATABASE_URL default works with Docker)

# 4. Run migrations + seed demo data
npm run migrate
npm run seed
npm run seed:demo    # loads Gujarat end-to-end demo (ALT-GJ-DEMO-001)

# 5. Start dev servers (backend :4000 + frontend :3000)
npm run dev
```

Open **http://localhost:3000**

### Option B — Existing PostgreSQL

```bash
psql -U postgres -c "CREATE USER nexora WITH PASSWORD 'nexora_pass';"
psql -U postgres -c "CREATE DATABASE nexora_ai OWNER nexora;"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Set DATABASE_URL=postgresql://nexora:nexora_pass@localhost:5432/nexora_ai in .env
npm install && npm run migrate && npm run seed && npm run dev
```

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@nexora.ai | Admin@1234! |
| State Admin (MH) | admin.mh@nexora.ai | MhAdmin@123! |
| State Admin (KL) | admin.kl@nexora.ai | KlAdmin@123! |
| State Admin (GJ) | admin.gj@nexora.ai | GjAdmin@123! |
| Field Worker | worker.kumar@nexora.ai | Worker@1234! |

---

## IBM Bob Integration

IBM Bob (watsonx.ai) is integrated as an **alert triage assistant**:

```
POST /api/bob/triage
Body: { "alert_id": "ALT-GJ-DEMO-001" }

Response:
{
  "summary": "Transformer TRF-GJ-001 in Bardoli shows exposed wiring and overheating...",
  "recommended_action": "Immediate isolation and emergency dispatch required...",
  "urgency_level": "critical",
  "risk_score": 94,
  "powered_by": "watsonx.ai granite-13b-chat-v2"
}
```

- Configure with `WATSONX_API_KEY`, `WATSONX_URL`, `WATSONX_PROJECT_ID` in `.env`
- Without credentials, falls back to rule-based summary (same response shape, `powered_by: "rule-based-fallback"`)
- Frontend: **AlertDetailPage → Risk Score tab → "Ask IBM Bob" button**

---

## Demo

- **Demo video:** see [`demo/demo-video-link.txt`](demo/demo-video-link.txt)
- **Live URL:** see [`demo/live-demo-url.txt`](demo/live-demo-url.txt)
- **Key demo flow:** Gujarat scenario `ALT-GJ-DEMO-001` — complaint → alert → assignment → GPS arrival → findings → risk 54 → 94 (safety override) → corrective action → admin approval → risk 94 → 28 → closed

---

## Known Limitations

- watsonx triage requires `WATSONX_API_KEY`, `WATSONX_URL`, `WATSONX_PROJECT_ID` — falls back gracefully when absent
- Weather data uses seeded mock records; live integration requires `WEATHER_API_KEY`
- GIS shows coordinate points; full PostGIS polygon boundaries require manual GeoJSON import
- File uploads default to local disk; IBM COS requires `IBM_COS_*` credentials
- No WebSocket push yet — dashboards refresh on poll interval
- Gujarat demo is fully seeded; other states have partial asset coverage

---

## What We're Most Proud Of

**The safety override rule in the Alert Risk Pipeline.** When a worker finds exposed live wiring or evidence of fire, no number of positive findings ("earthing is good", "load is within range") should be allowed to cancel that critical signal. We implemented a hard floor: critical conditions pin the risk score at ≥ 75 (Critical band) regardless of the pipeline arithmetic. This is the difference between a risk engine that is technically correct and one that is trustworthy for real infrastructure decisions.

The **6-tier assignment engine** is the other piece we're proud of — it mirrors real utility dispatch logic: try the closest qualified worker first, escalate outward through geographic rings, and only authorise cross-state dispatch with Super Admin approval, all logged to the audit trail.

---

## Repository Structure

```
.
├── src/                    ← canonical source entry (see src/README.md)
│   └── packages/           → symlink to monorepo packages
├── packages/
│   ├── backend/            ← Express + TypeScript API
│   ├── frontend/           ← React + Vite SPA
│   └── shared/             ← shared TypeScript types
├── docs/                   ← problem-statement, solution-overview, architecture, setup-guide
├── demo/                   ← video link, live URL, screenshots
├── presentation/           ← slides outline
├── docker-compose.yml      ← PostgreSQL 15 + pgAdmin
├── .env.example            ← all environment variables
└── submission.yaml         ← hackathon submission metadata
```
