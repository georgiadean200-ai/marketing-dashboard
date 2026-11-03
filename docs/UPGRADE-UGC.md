# Upgrading your live studio with UGC Discovery

About 20 minutes, plus Meta setup (docs/UGC.md). Do the steps in this order: **database first, then code**.
The new code expects the new tables; the new tables are harmless to the current code.

## 1. Back up (2 minutes)

Supabase → **Database → Backups**: confirm today's automatic backup exists (or, on the free plan, run
`supabase db dump` from the CLI). In GitHub, nothing to do: the change arrives as one commit you can revert.

## 2. Update the database (5 minutes)

Supabase → **SQL Editor** → New query → paste **`supabase/migrations/20261110000600_ugc.sql`** → **Run**.
It should finish with "Success". It:

- adds `instagram_connections`, `ig_mention_events`, `ugc_items`, `ugc_permission_events`
- adds `ugc_id` to `assets` and `content_items`
- updates `approve_content`, `mark_scheduled_manual`, `mark_published_manual` and `enqueue_job` so they refuse
  creator content without current permission (existing behaviour is otherwise unchanged)

Run it once only. If you use the Supabase CLI instead: `supabase db push`.

## 3. Update the code on GitHub (5 minutes)

Pick one:

**A. With git on your computer (recommended):** in your local copy of the repository, on an up-to-date `main`:
```bash
git checkout -b ugc-discovery
git am < ugc-discovery.patch        # applies the change as one commit with its message
npm install && npm run typecheck    # optional local check
git push -u origin ugc-discovery    # then open a pull request and merge it
```
If `git am` reports a conflict (only possible if you've edited the same files since deploying), use option B.

**B. Without git:** unzip `ugc-discovery-files.zip` over your project folder (it contains only new and changed
files, in their folders), then upload/commit them on GitHub. The full list is in `CHANGED-FILES.txt`.

## 4. Add settings in Vercel (5 minutes)

Vercel → your project → **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `META_GRAPH_VERSION` | `v25.0` |
| `META_TTC_IG_USER_ID` | The Tile Collective's Instagram user ID |
| `META_TTC_ACCESS_TOKEN` | TTC system-user token (**secret**) |
| `META_CTO_IG_USER_ID` / `META_CTO_ACCESS_TOKEN` | Cheap Tiles Online's, when ready |
| `META_APP_SECRET` | Meta app secret (**secret**, for mention webhooks) |
| `META_WEBHOOK_VERIFY_TOKEN` | A long random string you also enter in the Meta webhook settings |

You can deploy before the Meta values exist: the page works with **Import from Later**, and shows Instagram as
not connected.

## 5. Deploy

Merging to `main` (or pushing) triggers a Vercel deployment automatically. The new weekly job
(`/api/cron/ugc`, Mondays 7 am Brisbane) is added from `vercel.json`. After it's live, Vercel → **Settings → Cron Jobs**
should list four jobs.

## 6. Check it works

1. While signed in, open `/api/health`: `instagramTtc` should be `true` once its variables are set.
2. Open **UGC Discovery** in the sidebar (under Create).
3. **Import from Later:** paste two Instagram post links you've collected in Later, for example
   `https://www.instagram.com/p/XXXX/ @creator`. They appear as cards (no preview for imported links).
4. **Check for new content** (needs the Meta settings): tagged posts appear with previews and relevance scores.
5. On a card, **Generate caption**, then **Add to calendar**. Open the draft: Quality check shows the permission error.
6. **Permission…** → send the copied message from Instagram → set *Permission requested*. When the creator agrees,
   set *Permission granted* with their reply as evidence and tick *Instagram and Facebook feed*.
7. The draft's permission error clears and it can be approved; **Save to Content Library** becomes available.

## Rolling back

Code: revert the merge commit in GitHub; Vercel redeploys the previous version. The database tables can stay;
the previous code ignores them. (The updated approval functions only add the creator-permission check.)
