# Slides Outline — NEXORA AI Presentation

> Use this outline to build `presentation/slides.pdf` (Google Slides, PowerPoint, or Canva)

---

## Slide 1 — Title

**NEXORA AI**
*Intelligent Power Grid Alert Management & Predictive Maintenance*

IBM Bob AI Hackathon — Track U1: Utilities
Team: Mitesh Patel
GitHub: github.com/mitesh1502/bob-ai-hackathon-NexoraAi

---

## Slide 2 — The Problem

**Headline:** India's grid fails reactively. We fix that.

- 70%+ of Indian DISCOMs run calendar-based maintenance — ignoring sensor data, weather, and failure history
- MTTR: 6h urban / 31h rural. Pre-positioning crews cuts rural MTTR by 40–60%
- SCADA threshold alerts create thousands of noise alerts per day → alert fatigue
- Field findings are captured as free-text → never feeds back into risk models

*Visual: Before/After timeline — "Failure at 2 AM, crew dispatched at 6 AM" vs "Risk flagged 48h before, crew pre-positioned"*

---

## Slide 3 — Our Solution

**Headline:** Two risk engines. One platform. Every signal used.

**Engine 1 — Asset Health (v1.0.0)**
7-factor explainable score: sensor + weather + history + age + load + geographic + worker observations

**Engine 2 — Alert Pipeline (v2.0.0)**
11-step incremental pipeline: citizen complaint → GPS arrival → findings → corrective action → closure

**IBM Bob Integration**
watsonx.ai `granite-13b-chat-v2` reads full alert context → plain-English summary + recommended action

*Visual: Risk score breakdown card showing named contributions*

---

## Slide 4 — Architecture

**Headline:** Full-stack TypeScript, PostgreSQL, Docker. Ready for IBM Cloud.

Diagram:
```
[IoT Sensors] [Weather] [Citizen Complaints] [Field Reports]
           ↓         ↓           ↓               ↓
     [Risk Engine v1.0.0]    [Alert Pipeline v2.0.0]
               ↓                       ↓
         [PostgreSQL 15 + PostGIS]    [IBM Bob / watsonx.ai]
               ↓
     [React 18 + Vite Frontend]
```

Key numbers:
- 4 DB migrations, 30+ tables, 36-state geographic hierarchy
- 20 Express routers, 15 alert endpoints
- 22-state alert FSM with full audit trail

---

## Slide 5 — IBM Bob Integration

**Headline:** Ask IBM Bob — plain-English triage for every alert

Flow:
1. Admin/Worker clicks "Ask IBM Bob" in Alert Detail → Risk Score tab
2. `POST /api/bob/triage { alert_id }`
3. `bobService.ts` assembles: asset type + risk score + findings + sensor readings + weather
4. Calls `ibm/granite-13b-chat-v2` via watsonx.ai REST API
5. Returns: **summary**, **recommended_action**, **urgency_level**
6. Cached in `bob_triage_cache` table

**Graceful fallback:** Rule-based engine returns same JSON shape when credentials absent

*Visual: Screenshot of "Ask IBM Bob" response panel*

---

## Slide 6 — Demo Walkthrough

**Headline:** Gujarat end-to-end: 54 → 94 → 28

Demo Alert: `ALT-GJ-DEMO-001`
- Transformer TRF-GJ-001 in Bardoli, Surat, Gujarat
- Citizen complaint → alert created → Arjun Patel assigned (same-village tier 1)
- GPS arrival → exposed wiring + overheating found → risk 54 → 94 (safety override floor)
- Corrective action → admin approves evidence → risk 94 → 28 → alert closed

Key pages:
- `/state/alerts` — Alert list with status + priority badges
- `/state/alerts/ALT-GJ-DEMO-001` — 5-tab detail view
- `/worker/alerts/ALT-GJ-DEMO-001` — Full worker flow
- `/admin/maintenance` — Priority queue
- `/admin/map` — GIS Leaflet map

---

## Slide 7 — Impact & Differentiation

**Headline:** From reactive chaos to predictive precision

| Metric | Before NEXORA AI | With NEXORA AI |
|--------|-----------------|----------------|
| Alert prioritisation | Manual / none | risk × grid_impact × failure_prob |
| Field data capture | Free-text notes | Structured findings + GPS + images + measurements |
| Crew dispatch | Reactive (after failure) | Pre-positioned before weather event |
| Risk explanation | Black box / none | Named factor breakdown per asset |
| AI governance | None | Every prediction versioned + admin review + override log |

---

## Slide 8 — What's Next / Known Limitations

**Working now:**
- Full alert lifecycle (22 states)
- IBM Bob triage (with graceful fallback)
- Gujarat end-to-end demo seed
- Build: zero TypeScript errors ✅

**Limitations / Next steps:**
- WebSocket push notifications (currently polling)
- Live OpenWeatherMap integration (currently seeded mock data)
- Full PostGIS boundary polygons for state/district shapes
- Mobile-optimised PWA for field workers
- watsonx.ai fine-tuning on India grid failure datasets

---

## Slide 9 — Thank You

**NEXORA AI**
github.com/mitesh1502/bob-ai-hackathon-NexoraAi

Contact: mitesh@nexora-ai.in

*"The safety override rule: critical conditions always floor risk at 75 —
because the system that lets a worker's positive note override exposed live wiring
is not a risk engine, it's a liability."*
