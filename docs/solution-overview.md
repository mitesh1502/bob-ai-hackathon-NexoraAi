# Solution Overview — NEXORA AI

## Core Mechanism: Two Interlocking Risk Engines

NEXORA AI is built around two distinct but connected risk models that together cover the full lifecycle — from predictive maintenance planning to reactive incident resolution.

### Engine 1 — Asset Health Risk Engine (v1.0.0)

Every grid asset has a continuously updated risk score computed by `riskEngine.ts`. The engine is **additive and explainable**: it does not produce a black-box number. It produces a number *and a named list of every factor that contributed to it*. A State Admin looking at a transformer with risk score 78 sees exactly:

```
Worker observations:     +22  (overheating reported; oil leakage observed)
Sensor anomalies:        +18  (oil temp 102°C — 17°C above normal range)
Weather alerts:          +20  (active flood alert for Bardoli district)
Historical incidents:    +12  (3 flood-related failures in last 5 years)
Asset age:               +4   (installed 2001 — 23 years)
Load/capacity ratio:     +2   (running at 87% rated capacity)
Geographic exposure:     +0
─────────────────────────
Total:                   78   → HIGH
```

The seven factor weights are configurable per deployment via the `risk_factors` database table. Missing sensor data is never treated as a positive signal — it counts against the asset. Positive worker observations (earthing OK, no visible damage) lower the score, but only up to a safe ceiling — they cannot cancel a confirmed critical condition such as overheating or oil leakage.

### Engine 2 — Alert Risk Pipeline (v2.0.0)

When a citizen complaint or field observation triggers a formal Alert, a second pipeline takes over in `alertRiskPipeline.ts`. This pipeline is **incremental**: it starts from the asset's current risk score and adds or subtracts deltas as information arrives during the incident lifecycle:

| Step | Signal | Direction |
|------|--------|-----------|
| 0 | Risk before alert (baseline) | — |
| 1 | State Admin alert information | ± |
| 2 | Worker arrival verification (GPS match) | ± |
| 3 | Negative findings (overheating, exposed wiring…) | + |
| 4 | Positive findings (earthing OK, load in range…) | − |
| 5 | Geo-tagged evidence images | + |
| 6 | Measurements (voltage, temperature, vibration) | ± |
| 7 | Current sensor readings | ± |
| 8 | Weather conditions at time of inspection | ± |
| 9 | Historical incidents (recent matches) | + |
| 10 | Maintenance status | ± |

**Safety override rule (hard-coded):** If any of the following critical conditions are confirmed — exposed live wiring, fire evidence, severe structural damage, or immediate public hazard — the pipeline result is floored at 75 (Critical band) regardless of positive findings. This prevents a situation where a worker correctly noting "load is within range" inadvertently lowers the score on an asset with exposed wiring.

**Corrective action rule:** Risk can only *decrease* after `admin_approved_completion = TRUE` on the corrective action record. A worker marking a task "done" does not reduce risk. An admin must review and approve the evidence before the score moves.

## How It Differs from Naive Alerting

| Naive SCADA alerting | NEXORA AI |
|----------------------|-----------|
| Single threshold per sensor | 7-factor cross-correlated score |
| No grid-impact weighting | Priority = risk × grid_impact × failure_prob |
| No crew pre-positioning | Weather-triggered crew deployment screen |
| No field data structured capture | 22-state lifecycle with GPS, images, measurements |
| No AI triage | IBM Bob/watsonx summarises every alert in plain English |
| No audit trail | Every transition logged: who/when/why |

## Key Design Decisions

**1. Explainability is non-negotiable.** Every risk score ships with the full breakdown. Admins can override any prediction, but they must provide a written reason, which is stored in the audit log. A system that produces unexplained scores will be ignored by utility operators — or worse, blindly trusted.

**2. State isolation in the database layer, not the UI.** Every query that touches asset, alert, or worker data is filtered by `state_id = user.stateId` in the SQL itself. There is no reliance on the frontend to hide cross-state data. A State Admin with a manipulated JWT cannot see another state's data because the database will return zero rows.

**3. Graceful degradation for every external service.** Weather API not configured? Seeded mock records are used. Watsonx not configured? Rule-based fallback returns the same JSON shape. IBM COS not configured? Files go to local disk. The system is fully functional without any external credentials — making it evaluable in any environment.

**4. GPS trust hierarchy.** When a worker's phone captures a geo-tagged image, the system prefers EXIF GPS metadata embedded by the camera over app-captured GPS, and clearly labels which source was used. If the worker's arrival location is more than 200 metres from the assigned asset coordinates, a mismatch warning is flagged (not blocked) — both the original and corrected coordinates are preserved, never silently overwritten.

## User Experience Flow

### State Administrator
1. Receives notification of a new citizen complaint → converts to Alert via Create Alert form
2. Sees the Alert in the Alerts List with current status, priority, and risk score
3. Opens Alert Detail → Reviews worker assignment recommendations (with scoring reasons)
4. Approves assignment → Reviews field report when submitted
5. If findings are serious: escalates or triggers corrective action with deadline
6. Reviews corrective action evidence → Approves completion (triggers risk decrease)
7. Closes alert after follow-up verification passes

### Field Worker
1. Receives alert assignment notification → Opens Worker Alert page
2. Accepts or declines (with reason); if dangerous: marks unsafe
3. Travels to site → Records GPS arrival (mismatch warning if > 200 m)
4. Fills negative findings checklist (overheating, exposed wiring, oil leakage…)
5. Fills positive findings checklist (earthing OK, load in range…)
6. Uploads geo-tagged images (required: arrival photo + close-up of problem)
7. Enters measurements (voltage, temperature, vibration — out-of-range flagged in real time)
8. Submits field report → Status transitions to `report_submitted`

### IBM Bob Integration
At any point after a field report is submitted, an admin or worker can click **"Ask IBM Bob"** in the Risk Score tab of the Alert Detail page. The frontend calls `POST /api/bob/triage` with the `alert_id`. The backend assembles a structured prompt from the alert's asset type, current risk score, negative/positive findings, latest sensor readings, and weather conditions, then sends it to `ibm/granite-13b-chat-v2` via the watsonx.ai REST API. The response — a plain-English summary, recommended action, and urgency level — is cached in the `bob_triage_cache` table and displayed in the UI.
