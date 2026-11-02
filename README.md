# TTC Marketing Studio

The AI marketing studio for **The Tile Collective** and **Cheap Tiles Online**, as an independently hosted app:
Next.js 16 · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, Realtime) · Anthropic API · Shopify Admin API.

The dashboard's design and behaviour are carried over unchanged from the Claude Artifact version
(`legacy-ui/`); `legacy-ui/08-standalone.js` swaps only its data, AI and Shopify plumbing for this app's backend.

## What's in here

| Path | What it is |
|---|---|
| `supabase/migrations/` | Database schema, permissions, approval enforcement, append-only audit log, job queue, storage |
| `supabase/seed.sql` | The two brands and their approved guidelines |
| `src/lib/shopify/` | One Shopify app connection per store, token refresh, throttled product sync |
| `src/lib/ai/` | Server-side AI planner (weekly/monthly plans, drafts, fact checks) |
| `src/lib/content/facts.ts` | Blocks invented prices, stock, sizes, slip ratings and unlinked products |
| `src/lib/jobs/worker.ts` | Background worker for AI plans and Shopify syncs |
| `src/app/api/` | AI, Shopify, jobs, cron, webhooks, health |
| `legacy-ui/` | The original dashboard, unchanged, plus the adapter |
| `scripts/import-artifact-export.ts` | Moves real content from the artifact export into Supabase |
| `tests/` | Unit, planner and end-to-end tests (real Postgres) |
| `docs/` | Deployment guide, audit, Later findings |

## Start here

- **Deploying:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Continuing development with Claude Code:** [CLAUDE.md](CLAUDE.md)

## Local development

```bash
npm install
cp .env.example .env.local     # fill in values locally; never commit this file
npm run dev                    # http://localhost:3000
```

## Tests

```bash
npm run test:db    # 51 database security tests (needs a local PostgreSQL superuser; see supabase/run-db-tests.sh)
npm test           # unit, AI planner and end-to-end tests against a real local Postgres (TEST_DATABASE_URL)
npm run typecheck
```

## Safety rules built into the database

- Nothing is approved, scheduled or published except through the workflow functions; Contributors can only draft.
- Approvals are immutable; any change to an approved post's copy, products, images or date sends it back to review.
- The activity log is append-only (no updates or deletes, even by server code) and hash-chained so tampering is detectable.
- Each brand's products come only from its own linked Shopify store; posts can only link their own brand's products and images.
- Live publishing is disabled. The emergency pause blocks all scheduling actions.
