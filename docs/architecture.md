# Architecture — NEXORA AI

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA INPUTS                                  │
├───────────────┬──────────────────┬──────────────────────────────────┤
│  IoT Sensors  │  Weather API     │  Field Worker Observations        │
│  (per asset)  │  (per district)  │  (structured inspection reports)  │
│               │                  │                                    │
│  oil_temp     │  temperature     │  overheating / oil_leakage        │
│  voltage      │  rainfall_mm     │  water_ingress / poor_earthing    │
│  current_load │  wind_speed      │  no_visible_damage (positive)     │
│  vibration    │  storm_alert     │  load_within_range (positive)     │
│  humidity     │  flood_alert     │                                    │
└───────┬───────┴────────┬─────────┴─────────────────┬────────────────┘
        │                │                            │
        └────────────────┴────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        RISK ENGINE (v1.0.0)                          │
│                                                                      │
│  Input: asset + observations + sensor_readings +                     │
│         weather_records + historical_incidents                       │
│                                                                      │
│  Factors:                                                            │
│  1. Worker observations    (weight ~35%)                             │
│  2. Sensor anomalies       (weight ~25%)                             │
│  3. Weather alerts         (weight ~20%)                             │
│  4. Historical incidents   (weight ~10%)                             │
│  5. Asset age              (weight ~5%)                              │
│  6. Load/capacity ratio    (weight ~3%)                              │
│  7. Geographic risk        (weight ~2%)                              │
│                                                                      │
│  Output:                                                             │
│    risk_score (0–100)     risk_level (low/moderate/high/critical)   │
│    grid_impact_severity   failure_probability   outage_probability   │
│    maintenance_urgency    confidence_score       top_factors[]       │
│    explanation (natural language)                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────────┐
            │                                 │
            ▼                                 ▼
┌───────────────────────┐      ┌──────────────────────────────────┐
│  risk_predictions     │      │  assets (current_risk_score,     │
│  (versioned, stored)  │      │  current_risk_level,             │
│  requires admin review│      │  grid_impact_severity updated)   │
└───────────┬───────────┘      └──────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     MAINTENANCE PRIORITY QUEUE                       │
│  Priority = risk×0.4 + grid_impact×0.3 + failure_prob×0.2 + urgency×0.1
│  maintenance_plans table — status: pending_approval → approved       │
│  Admin review required (approve / reject / override with reason)     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CREW PRE-POSITIONING                              │
│  Trigger: weather alert in district AND high/critical assets         │
│  Match: worker.field_of_work == plan.required_skill                  │
│  Proximity: same_district > same_state > other                       │
│  crew_assignments table — all logged to audit_logs                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│              ROLE / STATE / DISTRICT / TALUKA ACCESS CONTROL         │
│  Enforced on every API call via authenticate + requireRole +         │
│  enforceStateAccess middleware.                                      │
│  super_admin: full national view                                     │
│  state_admin: their assigned state only (all queries filter by       │
│               state_id = user.stateId)                               │
│  worker: their own tasks and reports only                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `states` | 36 Indian states/UTs |
| `districts` | 220+ districts (complete for 7 states, demo for rest) |
| `talukas` | Sub-district level (seeded for 7 states) |
| `villages` | Village/town level |
| `assets` | Grid equipment (transformer, feeder, substation, etc.) |
| `asset_sensors` | Sensor definitions per asset |
| `sensor_readings` | Time-series sensor values |
| `weather_records` | District-level weather + alert flags |
| `historical_incidents` | Per-asset outage/failure history |
| `worker_observations` | Structured field inspection observations |
| `risk_predictions` | Every computed prediction (versioned, immutable) |
| `maintenance_plans` | AI-generated plans requiring admin approval |
| `crew_assignments` | Crew pre-positioning assignments |
| `audit_logs` | Full tamper-evident audit trail |

## API Surface

```
GET  /api/citizens/states
GET  /api/citizens/districts/:stateId
GET  /api/citizens/talukas/:districtId      ← NEW
GET  /api/citizens/villages/:talukaId       ← NEW
GET  /api/assets                            (paginated, filtered)
GET  /api/assets/:id
GET  /api/assets/:id/incidents              ← NEW
GET  /api/sensors/asset/:assetId
GET  /api/weather/district/:districtId
POST /api/risk/:assetId/compute
POST /api/risk/compute-all                  ← NEW
GET  /api/risk/:assetId/latest
PATCH /api/risk/:predictionId/review
GET  /api/maintenance/priority-queue
PATCH /api/maintenance/plans/:id/action
GET  /api/dashboard/super-admin
GET  /api/dashboard/state-admin
```
