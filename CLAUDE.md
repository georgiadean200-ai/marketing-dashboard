# Briefing for Claude Code

You are continuing TTC Marketing Studio, a production app for two tile brands that are separate businesses with separate
Shopify stores: The Tile Collective (`ttc`, premium, design-led) and Cheap Tiles Online (`cto`, value-focused).

## Non-negotiables
- **Preserve the dashboard design exactly.** UI lives in `legacy-ui/` (original, unchanged) and is bundled by
  `scripts/build-studio-ui.mjs`. Change behaviour only in `legacy-ui/08-standalone.js` unless asked. Do not restyle.
- **Never publish anything unapproved.** Approval, scheduling and publishing go only through the SQL workflow functions in
  `supabase/migrations/20261102000200_security.sql`. Live publishing (`publish.instagram` jobs) is disabled on purpose.
- **Never invent product facts.** Products come from Shopify via `src/lib/shopify/sync.ts`; AI drafts must pass
  `src/lib/content/facts.ts`. Missing data stays missing.
- **Keep brands isolated.** Every product, image, post, campaign and job is scoped by `brand_id`; database triggers enforce it.
- **Secrets only in environment variables.** Never ask the user to paste keys into chat; never log or return them.

## How it fits together
- Browser: `src/app/(studio)/studio/page.tsx` renders the original shell; `StudioBoot` creates a cookie-session Supabase
  client and loads `/studio/studio.js`. Reads use row level security; writes are checked by triggers.
- Server: AI and Shopify run only on the server (`src/lib/ai`, `src/lib/shopify`) using the secret Supabase key.
  Long work runs as jobs (`jobs` table, `claim_jobs`/`finish_job`), started immediately with `after()` and swept by cron.
- Times are stored as `timestamptz`; the dashboard shows Brisbane wall-clock (`YYYY-MM-DDTHH:MM`, UTC+10, no DST).

## Before you change anything
1. `npm install`, then run `npm run test:db`, `npm test` and `npm run typecheck`. All must pass before and after changes.
2. New database changes go in a new migration file; never edit an applied migration.
3. Add a test for every rule you add.

## Good next tasks
- Connect the real Supabase project and run the deployment checklist in `docs/DEPLOYMENT.md`.
- Analytics (Stage 5): Meta insights, GA4, Shopify orders into `analytics_snapshots`, each value labelled tracked/estimated/unavailable.
- Optional direct Instagram publishing via Meta's Content Publishing API, behind the existing approval checks and pause switch.
