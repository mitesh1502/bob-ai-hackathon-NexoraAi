# Screenshots — NEXORA AI

## Available Screenshots

| # | File | What it shows |
|---|------|---------------|
| 1 | `01-home-landing-page.png` | Public landing page — hero section with power-tower background, "Register as Worker / Register a Complaint / Track a Complaint / Login" CTAs |
| 2 | `02-super-admin-dashboard.png` | Super Admin Dashboard — KPI cards (15 assets, 1 critical risk, 1 open complaint), active weather alerts banner (Surat Flood, South Delhi Storm, etc.), Asset Risk Distribution chart, State Risk Summary table |
| 3 | `03-gis-infrastructure-map.png` | GIS Infrastructure Map — Leaflet map of India with colour-coded asset pins (green = Low, yellow = Moderate, orange = High, red = Critical), state/district/risk filters, asset + complaint layers |

## Previews

### 01 — Home / Landing Page
![NEXORA AI Home](01-home-landing-page.png)

### 02 — Super Admin Dashboard
![Super Admin Dashboard](02-super-admin-dashboard.png)

### 03 — GIS Infrastructure Map
![GIS Infrastructure Map](03-gis-infrastructure-map.png)

## To Add More Screenshots

Run the app (`npm run dev` after `docker compose up -d && npm run migrate && npm run seed`)
and capture:

| Suggested filename | Where to navigate |
|-------------------|------------------|
| `04-alert-list.png` | Login as `admin.gj@nexora.ai` → `/state/alerts` |
| `05-alert-detail-risk.png` | Open alert ALT-GJ-DEMO-001 → Risk Score tab |
| `06-ibm-bob-triage.png` | Risk Score tab → click "Ask IBM Bob" |
| `07-worker-alert-page.png` | Login as `arjun.patel@nexora.ai` → `/worker/alerts/:id` |
| `08-maintenance-queue.png` | Super Admin → `/admin/maintenance` |
