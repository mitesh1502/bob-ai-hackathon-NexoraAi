# Problem Statement — NEXORA AI (Track U1: Utilities)

## The Audience Affected

India's **State Electricity Boards (SEBs)** and private distribution companies (DISCOMs) are responsible for maintaining hundreds of thousands of transformers, feeders, substations, and distribution panels across 36 states and union territories, serving 1.4 billion people. Three groups bear the cost when this infrastructure fails:

1. **Field maintenance crews** — dispatched reactively after failure, often in dangerous post-storm conditions, without advance intelligence about which assets are most likely to fail next.
2. **State grid administrators** — managing maintenance backlogs with no ranked priority signal; every asset looks equally overdue on a calendar schedule.
3. **Citizens and critical facilities** — hospitals, water pumping stations, and rail yards that face unplanned outages averaging 4–8 hours, with MTTR (Mean Time To Restore) ranging from 6 hours in urban centres to 36+ hours in remote rural areas.

## Why Existing Alerting Tools Fall Short

Current utility operations in India rely on three approaches, all of which are reactive:

| Approach | What it does | What it misses |
|----------|-------------|----------------|
| **Calendar-based maintenance** | Inspect every 90 days, replace every 5 years | Ignores actual asset condition; treats a 2001 transformer at 95% load identically to a 2020 one at 45% load |
| **SCADA threshold alerts** | Triggers when a sensor crosses a single threshold (e.g., oil temp > 95°C) | Single-sensor; no cross-correlation with weather, history, or crew availability; no prioritisation by grid impact |
| **Manual complaint routing** | Field teams respond to citizen reports after failure | Always reactive; no predictive signal; no structured capture of what was found on site |

None of these systems answers the three questions a grid manager needs answered **before** a failure occurs:

1. Which assets are most likely to fail in the next 48 hours given the current weather forecast?
2. Of those, which failures would cause the largest customer impact?
3. Where should I pre-position crews right now to minimise response time?

## Quantified Pain

- **Alert fatigue**: SCADA systems generate thousands of threshold alerts per day across a state grid. Without cross-signal correlation, operators learn to ignore low-confidence alerts. Critical warnings get missed in the noise.
- **MTTR gap**: Industry studies of Indian DISCOMs show an average MTTR of 6.2 hours for urban faults and 31 hours for rural faults. A pre-positioned crew can cut the rural MTTR by 40–60% because travel time is eliminated.
- **Calendar waste**: An estimated 35% of scheduled maintenance visits find no fault, while genuinely degraded assets wait for their quarterly slot. Condition-based scheduling (triggered by actual sensor + weather signal) eliminates this waste.
- **Unstructured field data**: When a worker does find a problem, today's systems capture "fault reported" with a free-text note. There is no structured capture of overheating, oil leakage, earthing condition, or load reading — so the data never feeds back into future risk scoring.

## Why It Matters Now

Two converging trends make this problem urgent in 2024–2025:

1. **IoT adoption**: India's RDSS (Revamped Distribution Sector Scheme) is funding smart meter and sensor installation across the distribution grid. The sensor data is being collected — but the analytics layer to turn it into ranked maintenance priorities does not exist at most DISCOMs.

2. **Climate risk escalation**: The 2023 and 2024 monsoon seasons saw record-breaking flood events that caused cascading grid failures in Maharashtra, Kerala, and Gujarat. Transformers in flood-prone districts are systematically undertreated under calendar schedules, because the schedule does not know which assets are in flood zones and which are already running hot.

NEXORA AI addresses both: it ingests the sensor data that DISCOMs are now collecting, adds the weather forecast signal that is freely available, and produces the ranked, explainable priority list that maintenance managers can act on today — before the next storm hits.
