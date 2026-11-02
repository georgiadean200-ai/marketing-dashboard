# Later and social publishing (researched 3 November 2026)

**Finding: Later's scheduling product has no public API.** Later's documented API is the Later Influence Reporting API
(campaign and creator reporting, credentials via an account manager), not post scheduling. Zapier lists Later as not
supported. Later itself connects outward to Instagram, Facebook, TikTok, Pinterest and LinkedIn through those networks' APIs.
Some third-party tutorial sites describe a "Later REST API" with API keys; these do not match Later's own documentation.

**So the studio cannot push posts into Later automatically.** Options that avoid new subscriptions:

1. **Keep Later, manual hand-off (built).** Approved posts appear under Scheduling and publishing with
   *Copy caption* → schedule in Later → *Mark scheduled in Later*. The database records exactly which approved version
   was handed off, blocks duplicates, and cancels the hand-off if the post is edited.
2. **Publish directly to Instagram later (free, prepared but switched off).** Meta's Instagram Content Publishing API
   supports single images, carousels (up to 10 items), Reels, and Stories for business accounts, with a limit of 50 API
   posts per rolling 24 hours per account. It needs a Meta developer app, an Instagram professional account linked to a
   Facebook Page, and Meta app review for publishing permissions. Media must be at a public URL when publishing, so the
   publisher would use short-lived signed Storage links. If you adopt this, you may no longer need Later for Instagram.

Sources: Later Help Centre (help.later.com, help-influence.later.com), Zapier app directory, Meta developer documentation
(developers.facebook.com/docs/instagram-platform/content-publishing).
