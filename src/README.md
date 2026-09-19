# NEXORA AI — Source Code Layout

This `src/` directory is the canonical entry point for all source code
per the hackathon submission structure. All code lives in the monorepo
packages below.

## Directory Map

```
src/
├── README.md                  ← this file
├── .env.example               ← all environment variables (copy to ../.env)
├── package.json               ← root npm workspace config
├── package-lock.json          ← lockfile
├── docker-compose.yml         ← PostgreSQL + pgAdmin containers
└── packages/
    ├── backend/               ← Node.js / Express / TypeScript API (port 4000)
    │   ├── src/
    │   │   ├── config/        ← env.ts — typed config from process.env
    │   │   ├── database/      ← db.ts, migrate.ts, seed*.ts, migrations/*.sql
    │   │   ├── middleware/     ← auth.ts, errorHandler.ts
    │   │   ├── routes/        ← 20 Express routers (alerts, risk, assets, …)
    │   │   ├── services/      ← riskEngine.ts, alertRiskPipeline.ts,
    │   │   │                     alertAssignmentService.ts, bobService.ts, …
    │   │   ├── utils/         ← logger.ts (winston)
    │   │   └── server.ts      ← app bootstrap + all routers registered
    │   ├── package.json
    │   └── tsconfig.json
    │
    ├── frontend/              ← React 18 / Vite / TypeScript SPA (port 3000)
    │   ├── src/
    │   │   ├── components/    ← AdminLayout, GeoTaggedImageUpload,
    │   │   │                     MeasurementsSection
    │   │   ├── context/       ← AuthContext (JWT + role)
    │   │   ├── lib/           ← api.ts (axios instance), config.ts
    │   │   ├── pages/
    │   │   │   ├── admin/     ← SuperAdmin/StateAdmin dashboards,
    │   │   │   │                 Alerts (list/create/detail),
    │   │   │   │                 Assets, Maintenance, Crew, GIS Map,
    │   │   │   │                 Workers + Coverage, Risk, Audit, Settings
    │   │   │   └── worker/    ← WorkerDashboard, InspectionTasks,
    │   │   │                     InspectionReport, WorkerAlerts, WorkerAlert
    │   │   ├── App.tsx        ← React Router v6 routes + ProtectedRoute
    │   │   └── main.tsx
    │   ├── package.json
    │   ├── vite.config.ts     ← proxy /api → localhost:4000
    │   └── tsconfig.json
    │
    └── shared/                ← Shared TypeScript types (used by both)
        ├── src/
        │   ├── types.ts
        │   └── index.ts
        └── tsconfig.json
```

## Quick Start

```bash
# 1. From repo root — install all workspaces
npm install

# 2. Start DB (Docker)
docker compose up -d

# 3. Configure environment
cp .env.example .env    # edit JWT_SECRET + DATABASE_URL at minimum

# 4. Run migrations + seed
npm run migrate
npm run seed

# 5. Start dev servers
npm run dev             # backend :4000 + frontend :3000 concurrently
```

See [docs/setup-guide.md](../docs/setup-guide.md) for the full walkthrough.
