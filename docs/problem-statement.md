# Problem Statement — U1 Utilities

## The Challenge

India's power grid loses an estimated $1 million or more per hour during major blackouts. The national grid serves over 1.4 billion people across 36 states and union territories, with hundreds of thousands of transformers, feeders, substations, and distribution panels spanning urban, semi-urban, and rural areas. Equipment failure — not demand fluctuation — is responsible for the majority of unplanned outages.

Despite this, over 70% of Indian electricity distribution utilities still operate on calendar-based maintenance schedules: inspect every 3 months, replace every 5 years, regardless of actual equipment condition. This approach systematically ignores three rich signal sources that are available today: real-time sensor data from IoT-instrumented assets, weather forecast APIs that can predict storm and flood events 48+ hours in advance, and historical incident records that reveal recurring failure patterns at the asset level.

The U1 problem statement asks teams to build a solution that **combines these three inputs** — asset health sensors, weather forecasts, and historical incidents — into a system that can:
1. Predict which equipment is most likely to fail and cause an outage
2. Rank assets by the severity of the grid impact their failure would cause
3. Generate a prioritised maintenance queue that tells field managers *what to fix first and why*
4. Enable pre-positioning of repair crews before weather events hit high-risk areas

## Why It Matters

A single transformer serving 10,000 customers in a flood-prone district, installed in 2001 and running at 95% load, represents an entirely different risk profile than a new feeder in a low-rainfall area running at 45% capacity. Today's calendar-based systems treat them identically. NEXORA AI does not.

When a storm alert is issued for a district, the system should immediately identify which of that district's assets are already in a degraded state (based on sensor readings and worker observations), cross-reference that with historical incident patterns (has this transformer flooded before?), and surface a ranked list of crews to pre-position — before the outage happens, not after.
