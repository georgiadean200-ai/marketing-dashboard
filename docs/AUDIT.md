# Audit of the Claude Artifact version (2 November 2026)

## Where the data was stored
All studio data lived in the Claude artifact database (hosted by Anthropic), scoped to that one artifact:
content posts, approval records, activity log, campaigns, media metadata, brand guidelines, settings, the Shopify store link
and the imported product catalogue. Uploaded images would have lived in the artifact's own file store (none were uploaded).
Assistant conversations were stored privately per person.

Exported on 2 Nov 2026: 19 posts (16 demo, 3 real AI drafts), 6 approvals (all demo), 9 activity entries, no images, no campaigns.

## Persistence
Persistent across browser sessions and devices (verified by reading records back from the database server), but only
inside claude.ai, tied to that artifact and to claude.ai sign-in and sharing.

## Shopify: live vs cached
Nothing was live. 24 real TTC products were a snapshot imported on 2 Nov 2026 via the Claude Shopify connector; prices
and stock were as at that import. Cheap Tiles Online had no products. In this app, products refresh daily, on Shopify
product webhooks, and on demand; they are still a synced copy, with Shopify as the source of truth.

## Artifact-only features (replaced in this app)
| Artifact feature | Replacement |
|---|---|
| `window.claude.use("db")` | Supabase Postgres with row level security and triggers |
| `use("user")`, claude.ai sharing roles | Supabase Auth (invite-only) and per-brand roles in `memberships` |
| `use("sample")` (Claude on the viewer's account) | Anthropic API on the server with the studio's own key |
| `use("mcp")` Shopify connector (one store at a time) | One Shopify Dev Dashboard app per store, client credentials grant |
| `use("assets")` and `/_blob/` image links | Private Supabase Storage bucket with signed links |
| Artifact database rules | Postgres policies, triggers and workflow functions |

## Export path
Dashboard code: carried over unchanged (`legacy-ui/`). Data: exported to JSON (`studio-data-export.zip`) and imported with
`npm run import:artifact`, which migrates real posts and their approvals and activity, and deliberately leaves demo data behind.
