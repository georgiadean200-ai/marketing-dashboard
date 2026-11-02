-- TTC Marketing Studio · core schema
-- Text ids keep compatibility with records exported from the Claude Artifact version.

create extension if not exists pgcrypto with schema extensions;

-- ───────── Brands, people, roles ─────────
create table public.brands (
  id          text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  name        text not null,
  short_name  text not null,
  guidelines  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create type public.member_role as enum ('viewer', 'contributor', 'approver', 'admin');

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  created_at    timestamptz not null default now()
);

create table public.memberships (
  user_id      uuid not null references auth.users (id) on delete cascade,
  brand_id     text not null references public.brands (id) on delete cascade,
  role         public.member_role not null default 'contributor',
  can_publish  boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (user_id, brand_id)
);

create table public.settings (
  id          boolean primary key default true check (id),
  paused      boolean not null default false,
  changed_by  uuid,
  changed_at  timestamptz
);
insert into public.settings default values;

-- ───────── Shopify: one store per brand, strictly isolated ─────────
create table public.shopify_connections (
  brand_id       text primary key references public.brands (id) on delete cascade,
  shop_domain    text not null unique,             -- e.g. thetilecollective.myshopify.com
  public_domain  text,                             -- e.g. www.thetilecollective.com.au
  shop_name      text,
  currency       text,
  status         text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_sync_at   timestamptz,
  last_sync_id   text,
  last_error     text,
  product_count  int,
  linked_at      timestamptz not null default now()
);

-- Short-lived Admin API tokens from the client-credentials grant. No policies: server only.
create table public.shopify_tokens (
  brand_id      text primary key references public.brands (id) on delete cascade,
  access_token  text not null,
  expires_at    timestamptz not null
);

create table public.products (
  id                  text primary key,            -- shop-<brand>-<numeric id>
  brand_id            text not null references public.brands (id) on delete cascade,
  shop_domain         text not null,
  shopify_gid         text not null,
  handle              text not null default '',
  title               text not null,
  vendor              text not null default '',
  product_type        text not null default '',
  tags                text[] not null default '{}',
  size                text not null default '',
  colour              text not null default '',
  finish              text not null default '',
  specs               jsonb not null default '{}'::jsonb,
  kind                text not null default 'tile' check (kind in ('tile', 'accessory')),
  variants            jsonb not null default '[]'::jsonb,
  sku                 text not null default '',
  price               numeric(12, 2),
  price_label         text not null default '',
  currency            text not null default 'AUD',
  inventory           int,
  availability        text not null default '',
  description         text not null default '',
  url                 text not null default '',
  online_store        boolean not null default false,
  shopify_image_url   text not null default '',
  shopify_updated_at  timestamptz,
  active              boolean not null default true,
  sync_id             text,
  synced_at           timestamptz not null default now(),
  unique (brand_id, shopify_gid),
  check (id like 'shop-' || brand_id || '-%')
);
create index products_brand_active_idx on public.products (brand_id, active, kind);

-- ───────── Media ─────────
create table public.assets (
  id            text primary key default gen_random_uuid()::text,
  brand_id      text not null references public.brands (id) on delete cascade,
  storage_path  text not null unique,               -- <brand>/<uuid>-<file name> in the media bucket
  file_name     text not null,
  content_type  text not null default '',
  sha256        text,
  product_id    text references public.products (id) on delete set null,
  approved      boolean not null default false,
  approved_by   uuid references auth.users (id),
  approved_at   timestamptz,
  uploaded_by   uuid references auth.users (id) default auth.uid(),
  created_at    timestamptz not null default now()
);

-- ───────── Campaigns ─────────
create table public.campaigns (
  id           text primary key default gen_random_uuid()::text,
  brand_id     text not null references public.brands (id) on delete cascade,
  name         text not null default '',
  status       text not null default 'Proposal' check (status in ('Proposal', 'Approved', 'Live', 'Complete')),
  details      jsonb not null default '{}'::jsonb,   -- objective, audience, messaging, creative, kpis, schedule...
  product_ids  text[] not null default '{}',
  starts_on    date,
  ends_on      date,
  budget       numeric(12, 2),
  approved_by  uuid references auth.users (id),
  approved_at  timestamptz,
  created_by   uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ───────── Content ─────────
create type public.content_status as enum
  ('Idea', 'AI Draft', 'Needs Review', 'Changes Requested', 'Approved', 'Scheduled', 'Published', 'Failed');

create table public.content_items (
  id                  text primary key default ('c-' || replace(gen_random_uuid()::text, '-', '')),
  brand_id            text not null references public.brands (id) on delete cascade,
  campaign_id         text references public.campaigns (id) on delete set null,
  title               text not null default '',
  series              text not null default '',
  channel             text not null default 'Instagram',
  format              text not null default 'Single image',
  scheduled_at        timestamptz,
  caption             text not null default '',
  hashtags            text[] not null default '{}',
  product_ids         text[] not null default '{}',
  asset_ids           text[] not null default '{}',
  slides              jsonb not null default '[]'::jsonb,
  shots               jsonb not null default '[]'::jsonb,
  brief               text not null default '',
  direction           text not null default '',
  status              public.content_status not null default 'Idea',
  review_note         text not null default '',
  approval_id         text,
  client_fingerprint  text,                          -- fingerprint the dashboard displays
  publish_status      text not null default '',
  published_at        timestamptz,
  external_post_url   text,
  archived            boolean not null default false,
  demo                boolean not null default false,
  revision            int not null default 1,
  created_by          uuid references auth.users (id) default auth.uid(),
  created_by_agent    text,                          -- e.g. 'planner' when the AI drafted it
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index content_brand_date_idx on public.content_items (brand_id, scheduled_at);
create index content_brand_status_idx on public.content_items (brand_id, status);

create table public.content_revisions (
  id          bigserial primary key,
  content_id  text not null references public.content_items (id) on delete cascade,
  revision    int not null,
  snapshot    jsonb not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

create table public.approvals (
  id                  text primary key default ('ap-' || replace(gen_random_uuid()::text, '-', '')),
  content_id          text not null references public.content_items (id) on delete restrict,
  brand_id            text not null references public.brands (id),
  fingerprint         text not null,                 -- server-computed, used for enforcement
  client_fingerprint  text,
  snapshot            jsonb not null,
  approved_by         uuid,
  approved_at         timestamptz not null default now(),
  demo                boolean not null default false
);
alter table public.content_items
  add constraint content_approval_fk foreign key (approval_id) references public.approvals (id) deferrable initially deferred;

-- ───────── Scheduling and publishing (no live publishing yet) ─────────
create table public.publishing_jobs (
  id                bigserial primary key,
  content_id        text not null references public.content_items (id),
  approval_id       text not null references public.approvals (id),
  brand_id          text not null references public.brands (id),
  platform          text not null,                   -- 'later-manual', 'instagram'
  run_at            timestamptz not null,
  state             text not null default 'queued'
                    check (state in ('queued', 'sending', 'confirmed', 'failed', 'cancelled', 'manual')),
  attempts          int not null default 0,
  platform_post_id  text,                            -- only ever set from a platform confirmation
  last_error        text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (approval_id, platform)                     -- duplicate prevention
);

-- ───────── Background jobs (AI planning, Shopify sync) ─────────
create table public.jobs (
  id            bigserial primary key,
  type          text not null check (type in ('shopify.sync', 'ai.plan', 'ai.generate', 'publish.instagram')),
  brand_id      text references public.brands (id) on delete cascade,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  run_after     timestamptz not null default now(),
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  result        jsonb,
  dedupe_key    text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index jobs_ready_idx on public.jobs (status, run_after);
create unique index jobs_dedupe_active_idx on public.jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

-- ───────── Assistant conversations (private per person) ─────────
create table public.chat_messages (
  id           bigserial primary key,
  user_id      uuid not null references auth.users (id) on delete cascade default auth.uid(),
  brand_id     text not null references public.brands (id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  created_ids  text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ───────── Append-only activity log with a tamper-evident hash chain ─────────
create table public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  brand_id     text references public.brands (id),
  content_id   text,
  actor        uuid,                                 -- always auth.uid() of the session, never client-supplied
  actor_agent  text,                                 -- 'planner', 'shopify-sync', 'system'
  action       text not null,
  detail       text not null default '',
  data         jsonb not null default '{}'::jsonb,
  prev_hash    text,
  hash         text not null
);
create index audit_brand_at_idx on public.audit_log (brand_id, at desc);
