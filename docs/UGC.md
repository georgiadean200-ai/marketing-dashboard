# UGC Discovery (researched and built November 2026)

## What can connect to what

| Source | How it works in the studio | Why |
|---|---|---|
| **Instagram posts the brand is tagged in** | **Automatic** via Meta's official Instagram API (`GET /{ig-user-id}/tags`). Checked weekly and on demand. | Meta lists tagged posts for a brand's own professional account. |
| **Instagram caption @mentions** | **Automatic from setup onwards** via Meta's `mentions` webhook, then `mentioned_media`. | Meta only sends mentions as they happen and doesn't store them; past mentions can't be fetched. |
| **Later: Tags, Mentions, Media Library, collected UGC** | **Manual import**: paste post links (or a CSV) into *Import from Later*. | Later's Collect features work only inside Later; Later documents no API for reading them. |
| **Instagram Story mentions** | Not available | Meta's API doesn't support Story mentions. |
| Hashtag search, scraping, session cookies, private APIs | Not used | Not needed for tags and mentions, and scraping/unofficial access breaks Instagram's terms. |

Limits from Meta to know about: tags only appear once the tag is approved on Instagram; posts from private accounts
don't trigger mention webhooks; and `media_url` is omitted for videos with licensed audio or reels whose owner turned
off downloads (the studio shows the thumbnail or a link instead).

## How the feature works

1. **Discover**: tagged posts and webhook mentions are stored per brand with the creator's handle, caption, link,
   date and a short-lived preview link from Meta. **No third-party file is downloaded at this stage.**
2. **Deduplicate**: one record per post per brand (by Instagram shortcode, across tags, mentions and Later imports),
   and re-shares of the same caption by the same creator are marked as duplicates.
3. **Score**: an explainable 0–100 brand relevance score (names a catalogue product, shows a finished space, real
   project, builder/designer account, before-and-after, recency) and text-based product suggestions.
4. **Recommend**: the AI agent reviews the strongest posts (image and caption), picks one of Monday Inspiration,
   Save This Space, Customer Projects, Builder and Designer Features, Before and After, Product Features or
   Instagram Stories, writes an original caption, chooses products **only from the brand's verified Shopify
   catalogue**, and suggests a free date. Captions that state unverified facts are held back. Posts already used,
   dismissed, on the calendar or recommended in the last four weeks are not recommended again.
5. **Permission**: Not requested → Requested → Granted / Declined, with evidence, usage scope (feed, Stories, ads,
   website, email, print), optional expiry and the credit line. Every change is kept permanently.
   **Contributors** can mark a request as sent; **Approvers** record the creator's decision.
6. **Use**: *Add to calendar* creates a draft for review. **The database refuses to approve, schedule or mark it
   published unless permission is granted for social use and hasn't expired.** *Save to Content Library* copies the
   creator's file into private storage only after permission; the saved image still needs normal image approval.

Weekly automation (Monday 7 am Brisbane): check for new content, then prepare recommendations. Nothing is drafted to
the calendar, approved or published automatically.

## Setting up Instagram access (one Instagram account per brand)

You need: each brand's Instagram as a **professional (Business) account linked to a Facebook Page**, and admin access to
your Meta Business portfolio. Menu names change occasionally.

1. **developers.facebook.com → My Apps → Create app**, type **Business**, linked to your business portfolio.
   Add the **Instagram** product and choose **Instagram API with Facebook Login**.
2. **Meta Business Settings → Users → System users → Add** (Admin). Assign it the brand's **Facebook Page** and
   **Instagram account** as assets.
3. **Generate a token** for the system user with your app, choosing permissions for reading tags and mentions
   (Meta's docs list `instagram_basic` and `instagram_manage_comments`, with `pages_show_list`,
   `pages_read_engagement` and `business_management` for Page-linked access). Choose **never expire**.
   Because the accounts are your own, **Standard Access** is enough; no app review is needed for your own accounts.
4. Find the **Instagram user ID** (Graph API Explorer: `me/accounts?fields=instagram_business_account`).
5. In **Vercel → Settings → Environment Variables** add, per brand: `META_TTC_IG_USER_ID`, `META_TTC_ACCESS_TOKEN`
   (and `META_CTO_…` for Cheap Tiles Online). Never paste tokens anywhere else.
6. **Mentions webhook** (optional but recommended): in the app's Instagram → Webhooks, set the callback URL to
   `https://<your-app>/api/instagram/webhooks`, choose a verify token (any long random string) and subscribe to the
   **mentions** field. Add `META_APP_SECRET` (App settings → Basic) and `META_WEBHOOK_VERIFY_TOKEN` to Vercel.
   Meta requires the app to be in **Live** mode for webhooks, and may require your business to be **verified**.
7. Redeploy, then in UGC Discovery click **Check for new content**.

## Permission and credit practice

Ask before sharing, keep the reply, and credit the creator as agreed. The studio drafts the request message for you
to send from Instagram yourself; it never messages creators. If a creator later withdraws permission, set
**Permission declined**: scheduling and publishing of any post using their content is then refused.
