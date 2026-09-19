# Contributing to NEXORA AI

Thank you for your interest in contributing to NEXORA AI!

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/bob-ai-hackathon-NexoraAi.git`
3. **Create a branch**: `git checkout -b feature/your-feature-name`
4. **Follow the setup guide**: [docs/setup-guide.md](docs/setup-guide.md)

## Development Setup

```bash
npm install
docker compose up -d          # start PostgreSQL
cp .env.example .env          # configure (set JWT_SECRET)
npm run migrate               # run all 4 migrations
npm run seed && npm run seed:demo  # load demo data
npm run dev                   # backend :4000 + frontend :3000
```

## Code Standards

- **TypeScript strict mode** is enabled — no `any` without a comment explaining why
- **Parameterized queries only** — never interpolate values into SQL strings (`$1, $2, ...`)
- **State isolation** — every DB query that touches asset/alert/worker data must filter by `state_id`
- **No secrets in code** — all credentials via environment variables
- **Audit trail** — every alert status transition must write to `alert_status_history`

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/short-description` | `feature/websocket-push` |
| Bug fix | `fix/short-description` | `fix/gps-mismatch-calculation` |
| Docs | `docs/short-description` | `docs/api-reference` |
| Chore | `chore/short-description` | `chore/update-dependencies` |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add WebSocket push for alert status updates
fix: correct GPS mismatch threshold from 200m to correct Haversine calc
docs: expand setup guide with Windows PostgreSQL instructions
chore: upgrade vite to 5.4
```

## Pull Request Process

1. Ensure `npm run build` passes with **zero TypeScript errors**
2. Add/update tests if applicable
3. Update `docs/` if your change affects setup, architecture, or API surface
4. Fill out the PR template:
   - What does this change?
   - How was it tested?
   - Does it affect the DB schema? (if yes, add a migration)
   - Does it affect the IBM Bob integration?

## Security

- **Never commit `.env`** — it is in `.gitignore` for a reason
- **Never commit real credentials** — not even in comments
- If you discover a security vulnerability, email mitesh@nexora-ai.in privately before opening an issue

## Architecture Decisions

See [docs/architecture.md](docs/architecture.md) for the system design.

Key constraints that contributors must respect:
1. **Safety override rule** — critical conditions (exposed wiring, fire, structural damage) must always floor risk at ≥ 75 in `alertRiskPipeline.ts`
2. **Corrective action rule** — risk may only decrease after `admin_approved_completion = TRUE`
3. **6-tier assignment priority** — the order (same village → same taluka → … → cross-state) must not change without a documented spec decision
4. **State isolation** — every new API endpoint for admin data must include state filtering

## Questions?

Open a GitHub Issue or reach out via the repository discussions.
