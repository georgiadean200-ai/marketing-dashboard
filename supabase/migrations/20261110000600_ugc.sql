-- TTC Marketing Studio · UGC Discovery
-- Content from customers, designers, builders and creators who tag or mention a brand on Instagram, plus posts
-- added by hand (for example from Later's Media Library). Third-party media is never stored or reused without
-- recorded permission; the database enforces this, not just the dashboard.

-- ───────── Instagram account per brand (tokens live in server environment variables, never here) ─────────
create table public.instagram_connections (
  brand_id          text primary key references public.brands (id) on delete cascade,
  ig_user_id        text not null unique,
  username          text,
  status            text not null default 'connected' check (status in ('connected', 'error')),
  last_tags_sync_at timestamptz,
  last_mention_at   timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);

-- Caption @mentions only arrive by webhook (Meta does not store them), so each one is kept until processed.
create table public.ig_mention_events (
  id            bigserial primary key,
  brand_id      text not null references public.brands (id) on delete cascade,
  media_id      text not null,
  comment_id    text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  unique (brand_id, media_id, comment_id)
);

create type public.ugc_permission as enum
  ('Permission not requested', 'Permission requested', 'Permission granted', 'Permission declined');

create table public.ugc_items (
  id                    text primary key default ('u-' || replace(gen_random_uuid()::text, '-', '')),
  brand_id              text not null references public.brands (id) on delete cascade,
  fingerprint           text not null,                    -- ig:<shortcode> or id:<media id>; one row per post per brand
  sources               text[] not null default '{}',     -- instagram_tag, instagram_mention, later_import, manual
  platform              text not null default 'Instagram',
  external_id           text,                             -- Instagram media id, when known
  permalink             text not null default '',
  creator_handle        text not null default '',
  caption               text not null default '',
  caption_hash          text,                             -- spots the same post re-shared under a new link
  media_type            text not null default '',
  preview_url           text,                             -- short-lived link from Meta for review; the file is not stored
  preview_refreshed_at  timestamptz,
  posted_at             timestamptz,
  discovered_at         timestamptz not null default now(),
  status                text not null default 'new' check (status in ('new', 'shortlisted', 'recommended', 'used', 'dismissed')),
  duplicate_of          text references public.ugc_items (id) on delete set null,
  relevance_score       int check (relevance_score between 0 and 100),
  relevance_reasons     text[] not null default '{}',
  product_matches       text[] not null default '{}',     -- verified catalogue ids suggested from the caption
  suggestion            jsonb,                            -- AI recommendation: series, caption, products, date, why
  last_recommended_at   timestamptz,
  times_recommended     int not null default 0,
  permission_status     public.ugc_permission not null default 'Permission not requested',
  permission_requested_at timestamptz,
  permission_requested_via text,
  permission_granted_at timestamptz,
  permission_evidence   text not null default '',          -- e.g. link to the comment/DM, or a note of the reply
  usage_scope           text[] not null default '{}',      -- organic_social, stories, paid_ads, website, email, print
  usage_expires_on      date,
  attribution           text not null default '',          -- credit line to publish, e.g. "📷 @handle"
  permission_recorded_by uuid,
  asset_id              text references public.assets (id) on delete set null,  -- set only after permission
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  unique (brand_id, fingerprint)
);
create index ugc_brand_status_idx on public.ugc_items (brand_id, status, relevance_score desc);
create index ugc_caption_hash_idx on public.ugc_items (brand_id, caption_hash);

-- Every permission change, kept permanently.
create table public.ugc_permission_events (
  id           bigserial primary key,
  ugc_id       text not null references public.ugc_items (id) on delete cascade,
  brand_id     text not null references public.brands (id),
  status       public.ugc_permission not null,
  evidence     text not null default '',
  usage_scope  text[] not null default '{}',
  expires_on   date,
  attribution  text not null default '',
  recorded_by  uuid,
  at           timestamptz not null default now()
);
create trigger ugc_permission_events_immutable before update or delete on public.ugc_permission_events
  for each row execute function public.forbid_change();

-- Images saved from UGC carry their origin; posts can point back to the UGC they use.
alter table public.assets add column ugc_id text references public.ugc_items (id) on delete set null;
alter table public.content_items add column ugc_id text references public.ugc_items (id) on delete set null;

-- Two extra content series used by UGC recommendations.
update public.brands set guidelines = guidelines || '{"ugc_series": ["Builder and Designer Features", "Before and After"]}'::jsonb;

-- ───────── Permission checks ─────────
create or replace function public.ugc_permission_ok(p_ugc text, p_scope text default 'organic_social')
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.permission_status = 'Permission granted' and p_scope = any (u.usage_scope)
                          and (u.usage_expires_on is null or u.usage_expires_on >= current_date)
                   from public.ugc_items u where u.id = p_ugc), false);
$$;

create or replace function public.guard_ugc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.creator_handle := lower(regexp_replace(coalesce(new.creator_handle, ''), '^@', ''));
  if tg_op = 'UPDATE' then
    if new.brand_id <> old.brand_id or new.fingerprint <> old.fingerprint then raise exception 'UGC cannot move between brands or posts'; end if;
    -- Server-owned fields: only background jobs change discovery data and AI suggestions.
    if not public.is_service() and (new.external_id is distinct from old.external_id or new.preview_url is distinct from old.preview_url
        or new.relevance_score is distinct from old.relevance_score or new.suggestion is distinct from old.suggestion
        or new.asset_id is distinct from old.asset_id or new.sources is distinct from old.sources) then
      raise exception 'Discovery data is updated by the server only' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and not public.is_service() then
    if new.permission_status <> 'Permission not requested' or new.asset_id is not null or new.suggestion is not null then
      raise exception 'New UGC starts without permission, images or suggestions' using errcode = '42501';
    end if;
    if not (new.sources <@ array['later_import', 'manual']) then
      raise exception 'Only server discovery can add Instagram API sources' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.permission_status is distinct from old.permission_status then
    if new.permission_status in ('Permission granted', 'Permission declined') and not public.is_service()
       and not public.has_role(new.brand_id, 'approver') then
      raise exception 'Only approvers can record a creator''s decision' using errcode = '42501';
    end if;
    if new.permission_status = 'Permission granted' then
      if length(trim(new.permission_evidence)) < 5 then raise exception 'Record evidence of the creator''s permission'; end if;
      if coalesce(array_length(new.usage_scope, 1), 0) = 0 then raise exception 'Record what the creator agreed to (usage scope)'; end if;
      if length(trim(new.attribution)) = 0 then raise exception 'Record how the creator should be credited'; end if;
      new.permission_granted_at := now();
    elsif new.permission_status = 'Permission requested' then
      new.permission_requested_at := now();
    elsif new.permission_status = 'Permission declined' then
      new.usage_scope := '{}';
    end if;
    new.permission_recorded_by := auth.uid();
    insert into public.ugc_permission_events (ugc_id, brand_id, status, evidence, usage_scope, expires_on, attribution, recorded_by)
    values (new.id, new.brand_id, new.permission_status, new.permission_evidence, new.usage_scope, new.usage_expires_on, new.attribution, auth.uid());
    perform public.log_event(new.brand_id, new.permission_status::text, '@' || new.creator_handle || ' · ' || new.permalink);
  elsif tg_op = 'UPDATE' and new.permission_status = 'Permission granted'
        and (new.usage_scope is distinct from old.usage_scope or new.usage_expires_on is distinct from old.usage_expires_on
             or new.permission_evidence is distinct from old.permission_evidence or new.attribution is distinct from old.attribution) then
    if not public.is_service() and not public.has_role(new.brand_id, 'approver') then
      raise exception 'Only approvers can change a granted permission' using errcode = '42501';
    end if;
    insert into public.ugc_permission_events (ugc_id, brand_id, status, evidence, usage_scope, expires_on, attribution, recorded_by)
    values (new.id, new.brand_id, new.permission_status, new.permission_evidence, new.usage_scope, new.usage_expires_on, new.attribution, auth.uid());
  end if;
  if new.asset_id is not null and (tg_op = 'INSERT' or new.asset_id is distinct from old.asset_id)
     and not (new.permission_status = 'Permission granted' and 'organic_social' = any (new.usage_scope)) then
    raise exception 'Media can only be saved after the creator grants permission' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger ugc_guard before insert or update on public.ugc_items for each row execute function public.guard_ugc();

-- Saved UGC images must have permission and belong to the same brand.
create or replace function public.guard_ugc_asset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ugc_id is not null then
    if not exists (select 1 from public.ugc_items u where u.id = new.ugc_id and u.brand_id = new.brand_id) then
      raise exception 'UGC must belong to brand %', new.brand_id using errcode = '23514';
    end if;
    if not public.ugc_permission_ok(new.ugc_id) then
      raise exception 'Media can only be saved after the creator grants permission' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger assets_ugc_guard before insert or update of ugc_id on public.assets for each row execute function public.guard_ugc_asset();

create or replace function public.guard_content_ugc() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ugc_id is not null and not exists (select 1 from public.ugc_items u where u.id = new.ugc_id and u.brand_id = new.brand_id) then
    raise exception 'UGC must belong to brand %', new.brand_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger content_ugc_link before insert or update of ugc_id, brand_id on public.content_items
  for each row execute function public.guard_content_ugc();

-- ───────── Approval and scheduling refuse UGC without current permission ─────────
create or replace function public.approve_content(p_content text, p_client_fingerprint text default null)
returns text language plpgsql security definer set search_path = public as $$
declare c public.content_items; v_id text;
begin
  select * into c from public.content_items where id = p_content for update;
  if not found then raise exception 'Content not found'; end if;
  if not public.has_role(c.brand_id, 'approver') then raise exception 'Only approvers can approve' using errcode = '42501'; end if;
  if c.status <> 'Needs Review' then raise exception 'Only content in review can be approved'; end if;
  if c.scheduled_at is null or c.caption = '' then raise exception 'Content needs a date and caption'; end if;
  if exists (select 1 from unnest(c.asset_ids) aid join public.assets a on a.id = aid where not a.approved) then
    raise exception 'Uses imagery that is not approved for final use';
  end if;
  if c.ugc_id is not null and not public.ugc_permission_ok(c.ugc_id) then
    raise exception 'Uses creator content without current permission for social use';
  end if;
  v_id := 'ap-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.approvals (id, content_id, brand_id, fingerprint, client_fingerprint, snapshot, approved_by)
  values (v_id, c.id, c.brand_id, public.content_fingerprint(c), p_client_fingerprint, to_jsonb(c), auth.uid());
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Approved', approval_id = v_id, client_fingerprint = p_client_fingerprint, review_note = '' where id = c.id;
  perform set_config('app.via_workflow', 'off', true);
  return v_id;
end $$;

create or replace function public.mark_scheduled_manual(p_content text, p_platform text default 'later-manual')
returns bigint language plpgsql security definer set search_path = public as $$
declare c public.content_items; v_job bigint;
begin
  if (select paused from public.settings) then raise exception 'Publishing is paused'; end if;
  select * into c from public.content_items where id = p_content for update;
  if not public.can_publish(c.brand_id) then raise exception 'You do not have publishing permission' using errcode = '42501'; end if;
  if c.status <> 'Approved' then raise exception 'Only approved content can be scheduled'; end if;
  if c.ugc_id is not null and not public.ugc_permission_ok(c.ugc_id) then
    raise exception 'The creator''s permission is missing, declined or expired';
  end if;
  insert into public.publishing_jobs (content_id, approval_id, brand_id, platform, run_at, state)
  values (c.id, c.approval_id, c.brand_id, p_platform, c.scheduled_at, 'manual') returning id into v_job;
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Scheduled', publish_status = 'Scheduled manually in Later' where id = c.id;
  perform set_config('app.via_workflow', 'off', true);
  return v_job;
end $$;

create or replace function public.mark_published_manual(p_content text, p_post_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  if (select paused from public.settings) then raise exception 'Publishing is paused'; end if;
  select * into c from public.content_items where id = p_content for update;
  if not public.can_publish(c.brand_id) then raise exception 'You do not have publishing permission' using errcode = '42501'; end if;
  if c.status not in ('Approved', 'Scheduled') then raise exception 'Only approved content can be marked published'; end if;
  if c.published_at is not null then raise exception 'Already marked published'; end if;
  if c.ugc_id is not null and not public.ugc_permission_ok(c.ugc_id) then
    raise exception 'The creator''s permission is missing, declined or expired';
  end if;
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Published', published_at = now(), external_post_url = p_post_url,
         publish_status = 'Posted — confirmed manually' where id = c.id;
  update public.publishing_jobs set state = 'confirmed', updated_at = now() where content_id = c.id and approval_id = c.approval_id;
  if c.ugc_id is not null then update public.ugc_items set status = 'used' where id = c.ugc_id; end if;
  perform set_config('app.via_workflow', 'off', true);
end $$;

-- ───────── Jobs: discovery and recommendations ─────────
alter table public.jobs drop constraint jobs_type_check;
alter table public.jobs add constraint jobs_type_check
  check (type in ('shopify.sync', 'ai.plan', 'ai.generate', 'publish.instagram', 'ugc.discover', 'ugc.recommend'));

create or replace function public.enqueue_job(p_type text, p_brand text, p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null, p_run_after timestamptz default now())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_service() then
    if p_type in ('shopify.sync', 'ugc.discover') and not public.has_role(p_brand, 'approver') then raise exception 'Only approvers can run discovery or syncs' using errcode = '42501'; end if;
    if p_type in ('ai.plan', 'ai.generate', 'ugc.recommend') and not public.has_role(p_brand, 'contributor') then raise exception 'Contributors and above can run the AI' using errcode = '42501'; end if;
    if p_type = 'publish.instagram' then raise exception 'Live publishing is not enabled' using errcode = '42501'; end if;
  end if;
  insert into public.jobs (type, brand_id, payload, dedupe_key, run_after) values (p_type, p_brand, p_payload, p_dedupe, p_run_after)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.jobs where dedupe_key = p_dedupe and status in ('queued', 'running'); end if;
  return v_id;
end $$;

-- ───────── Row level security ─────────
alter table public.instagram_connections enable row level security;
alter table public.ig_mention_events enable row level security;
alter table public.ugc_items enable row level security;
alter table public.ugc_permission_events enable row level security;

create policy igconn_read on public.instagram_connections for select using (public.has_role(brand_id, 'viewer'));
create policy ugc_read on public.ugc_items for select using (public.has_role(brand_id, 'viewer'));
create policy ugc_ins on public.ugc_items for insert with check (public.has_role(brand_id, 'contributor'));
create policy ugc_upd on public.ugc_items for update using (public.has_role(brand_id, 'contributor')) with check (public.has_role(brand_id, 'contributor'));
create policy ugc_del on public.ugc_items for delete using (public.has_role(brand_id, 'approver'));
create policy ugc_events_read on public.ugc_permission_events for select using (public.has_role(brand_id, 'viewer'));

revoke insert, update, delete, truncate on public.instagram_connections, public.ig_mention_events, public.ugc_permission_events from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ugc_items, public.instagram_connections;
  end if;
end $$;
