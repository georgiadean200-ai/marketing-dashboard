# Deploying TTC Marketing Studio

About 60–90 minutes the first time. You'll need: a GitHub account, a Supabase account, a Vercel account, an Anthropic
API account, and staff access to both Shopify stores with permission to install apps.

> **Secrets rule.** Keys go only into Supabase, Vercel or your local `.env.local`. Never paste them into chat, email,
> Slack or a document, and never commit `.env.local`. If a key is ever exposed, revoke it and make a new one.

Menu names below were correct when written; providers occasionally rename things.

---

## 1. Put the code on GitHub

1. Unzip `ttc-marketing-studio.zip`.
2. Create a **private** repository on GitHub (for example `ttc-marketing-studio`).
3. Upload the folder's contents (or `git init`, `git add .`, `git commit`, `git push`). `.gitignore` already excludes
   secrets and build output.

## 2. Create the Supabase project

1. supabase.com → **New project**. Name it `ttc-marketing-studio`, region **Sydney (ap-southeast-2)**, and save the
   database password in your password manager.
2. When it's ready, open **SQL Editor** and run each file from `supabase/migrations/` **in filename order**
   (100 → 200 → 300 → 400 → 500), then `supabase/seed.sql`. Each should finish with "Success".
   *(Alternative: the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)*
3. **Authentication → Sign In / Providers → Email:** keep Email enabled and **turn off "Allow new users to sign up"**.
   The studio is invite-only.
4. **Authentication → URL Configuration:** set **Site URL** to your app address (after step 4 you'll know it, for example
   `https://ttc-marketing-studio.vercel.app`) and add `https://<your-app>/auth/callback` to **Redirect URLs**.
5. **Authentication → Users → Invite user:** invite yourself.
6. Give yourself access to both brands. In **SQL Editor**, run (with your email):
   ```sql
   insert into public.memberships (user_id, brand_id, role, can_publish)
   select id, b.id, 'admin', true from auth.users, (values ('ttc'), ('cto')) as b(id)
   where email = 'you@example.com';
   ```
   Roles: `viewer` (read), `contributor` (draft), `approver` (approve and schedule), `admin` (everything, including pause).
7. **Project Settings → API Keys:** note where the **Project URL**, **publishable key** and **secret key** are. You'll copy
   them straight into Vercel in step 4.

## 3. Create one Shopify app per store

Do this **twice**: once in The Tile Collective's Shopify admin and once in Cheap Tiles Online's. The apps are separate,
so each brand can only ever read its own store.

1. Shopify admin → **Settings → Apps → Develop apps → Build apps in Dev Dashboard** → **Create app**.
2. Name it `TTC Marketing Studio` (or `CTO Marketing Studio`).
3. Configure **Admin API access scopes**: `read_products` and `read_inventory` only. The studio never writes to Shopify.
4. Add webhooks for **products/create**, **products/update** and **products/delete**, sent to
   `https://<your-app>/api/shopify/webhooks` (format JSON).
5. Release the version and **install the app on that store**.
6. Note the app's **Client ID** and **Client secret**, and the store's `.myshopify.com` address
   (Settings → Domains). These go into Vercel in step 4.

Since 1 January 2026 Shopify issues API access for apps like this through the **client credentials grant**: the studio
exchanges the Client ID and secret for a token that lasts about 24 hours and renews it automatically.

## 4. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the GitHub repository. Framework: **Next.js** (detected automatically).
2. Before deploying, open **Environment Variables** and add (Production and Preview):

   | Name | Where it comes from |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API Keys → Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
   | `SUPABASE_SECRET_KEY` | Supabase secret key (**secret**) |
   | `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (**secret**) |
   | `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
   | `SHOPIFY_API_VERSION` | `2026-07` |
   | `SHOPIFY_TTC_SHOP` | TTC store's `.myshopify.com` address |
   | `SHOPIFY_TTC_CLIENT_ID` / `SHOPIFY_TTC_CLIENT_SECRET` | TTC Dev Dashboard app (**secret**) |
   | `SHOPIFY_CTO_SHOP` | CTO store's `.myshopify.com` address |
   | `SHOPIFY_CTO_CLIENT_ID` / `SHOPIFY_CTO_CLIENT_SECRET` | CTO Dev Dashboard app (**secret**) |
   | `CRON_SECRET` | A long random string you generate (for example a password manager's 40-character generator) |
   | `NEXT_PUBLIC_SITE_URL` | Your app's address, for example `https://ttc-marketing-studio.vercel.app` |

3. **Deploy.** Then go back to Supabase step 2.4 and set the Site URL and redirect URL to the real address.

**Scheduled tasks.** `vercel.json` schedules a daily Shopify refresh (5 am Brisbane), the AI planning check
(9 am Brisbane; plans are made on Thursdays) and a daily worker sweep. These are within Vercel's free plan.
Jobs you start from the dashboard run immediately. If you'd like the background worker to sweep every 5 minutes on the
free plan, run this once in Supabase **SQL Editor**, typing your own app address and CRON_SECRET into the SQL editor
(this stores the secret in Supabase Vault):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<your CRON_SECRET>', 'studio_cron_secret');
select cron.schedule('studio-worker', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://<your-app>/api/jobs/run',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'studio_cron_secret')));
$$);
```

## 5. Anthropic API

1. console.anthropic.com → **API Keys → Create key**, named `TTC Marketing Studio (production)`.
2. **Set a monthly spend limit** under Billing/Limits so costs can't run away.
3. Put the key in Vercel as `ANTHROPIC_API_KEY` (step 4). The key is used only on the server; it never reaches the browser.

## 6. First run and tests

1. Open your app → sign in with the emailed link.
2. Visit `https://<your-app>/api/health` while signed in. Every setting should be `true`, `database` should be
   `"reachable"`, `brands` should be `2`, and **`serverKeyRecognised` must be `true`**. If it's false, the secret key isn't
   being treated as server code; stop and recheck the key before going further.
3. **Product library (TTC) → Import latest from Shopify.** About 1,500 products should arrive in a minute or two.
   Switch to CTO and do the same.
4. **Move your existing studio content** (from your computer, in the project folder, with `.env.local` containing the
   Supabase URL and secret key):
   ```bash
   npm install
   npm run import:artifact -- ./studio-data-export            # dry run: shows what would move
   npm run import:artifact -- ./studio-data-export --apply    # imports
   ```
   It brings across the 3 real AI drafts and their activity, leaves the 16 demo posts behind, and is safe to re-run.
5. **AI assistant (TTC):** ask "Prepare next week's content for my approval." Within a minute or two, drafts should appear
   in the Approval Queue, each linked to real products.
6. **Approval checks:** approve one post, then edit its caption and save; it must return to *Needs review*. Approve it again,
   then *Mark scheduled in Later*.
7. **Permission check with a second person:** invite a colleague as `contributor` for TTC only. They should be able to
   draft but not approve, schedule or approve images, and should not see CTO at all.
8. **Emergency pause:** Settings → pause, and confirm *Mark scheduled* is refused; then resume.

## 7. If something goes wrong

- **Sign-in link says expired:** links last an hour and work once; request a new one. Check the redirect URL (step 2.4).
- **"You don't have access to a brand yet":** add a `memberships` row (step 2.6).
- **Shopify import fails:** the message names the problem. Common causes: the app isn't installed on that store, the
  `.myshopify.com` address is wrong, or the scopes weren't released.
- **AI drafts don't appear:** check the job under Supabase → Table Editor → `jobs` (`last_error`), and that the Anthropic
  key and spend limit are set.
