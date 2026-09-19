# Setup Guide — NEXORA AI

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with `uuid-ossp` extension
- npm or yarn

## 1. Clone & Install

```bash
git clone <repo-url>
cd nexora-ai
npm install
```

## 2. Environment Variables

Create `packages/backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/nexora_ai
JWT_SECRET=your-secret-key-here
PORT=4000
```

Create `packages/frontend/.env`:

```env
VITE_API_URL=http://localhost:4000/api
```

## 3. Database Setup

Create the database:

```bash
psql -U postgres -c "CREATE DATABASE nexora_ai;"
psql -U postgres -d nexora_ai -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

## 4. Run Migrations

```bash
npx ts-node --project packages/backend/tsconfig.json packages/backend/src/database/migrate.ts
```

This applies:
- `001_initial_schema.sql` — full schema (states, assets, risk, maintenance, etc.)
- `002_talukas_villages.sql` — talukas, villages, and new FK columns

## 5. Seed Geography Data

This step seeds all 36 Indian states/UTs, complete district lists for 7 states, and talukas/villages:

```bash
npx ts-node --project packages/backend/tsconfig.json packages/backend/src/database/seed_geography.ts
```

## 6. Seed Demo Data

Seeds admin users, workers, assets, sensor readings, weather records, historical incidents, and computes risk scores for all 15 demo assets:

```bash
npx ts-node --project packages/backend/tsconfig.json packages/backend/src/database/seed.ts
```

## 7. Start Backend

```bash
cd packages/backend
npm run dev
# Server starts on port 4000
```

## 8. Start Frontend

```bash
cd packages/frontend
npm run dev
# App starts on port 3000 (or 5173 with Vite)
```

## 9. Access the Application

Open `http://localhost:3000`

**Demo accounts:**

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@nexora.ai | Admin@1234! |
| State Admin (MH) | admin.mh@nexora.ai | MhAdmin@123! |
| State Admin (KL) | admin.kl@nexora.ai | KlAdmin@123! |
| Worker | worker.kumar@nexora.ai | Worker@1234! |

## 10. Key Workflows to Demo

1. **Super Admin Dashboard** → `/admin/dashboard` — 36-state risk view, weather alerts
2. **Asset Detail** → click any asset → Sensor/Weather/History panels + "Why this risk score"
3. **Maintenance Queue** → `/admin/maintenance` — filter by state/risk level, refresh queue
4. **Crew Pre-Positioning** → `/admin/crew` — select a critical plan, view qualified workers
5. **GIS Map** → `/admin/map` — geographic distribution of all assets

## Troubleshooting

**Migration already applied**: Safe to re-run — migrations track applied files and skip duplicates.

**Seed errors on re-run**: All seed inserts use `ON CONFLICT DO NOTHING` — safe to run multiple times.

**Port conflicts**: Change `PORT=4000` in backend `.env` and `VITE_API_URL` in frontend `.env`.
