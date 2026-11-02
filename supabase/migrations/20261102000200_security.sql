-- TTC Marketing Studio · permissions, approval enforcement, append-only audit log, row level security

-- ───────── Role helpers ─────────
create or replace function public.has_role(p_brand text, p_min public.member_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.user_id = auth.uid() and m.brand_id = p_brand and m.role >= p_min);
$$;

create or replace function public.can_publish(p_brand text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.user_id = auth.uid() and m.brand_id = p_brand
                   and (m.can_publish or m.role >= 'approver'));
$$;

-- Server code: requests signed with the secret (service role) key, or direct database sessions such as
-- migrations. Uses session_user and the request's JWT role, never current_user, because current_user is the
-- function owner inside SECURITY DEFINER functions and would make every caller look privileged.
create or replace function public.is_service()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or (coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')
          and session_user in ('postgres', 'supabase_admin'));
$$;

-- ───────── Append-only audit log ─────────
create or replace function public.audit_chain() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log_chain'));
  select hash into v_prev from public.audit_log order by id desc limit 1;
  new.prev_hash := v_prev;
  new.at := now();
  new.hash := encode(extensions.digest(
    coalesce(v_prev, '') || '|' || extract(epoch from new.at)::text || '|' || coalesce(new.brand_id, '') || '|' || coalesce(new.content_id, '') || '|' ||
    coalesce(new.actor::text, '') || '|' || coalesce(new.actor_agent, '') || '|' || new.action || '|' || new.detail || '|' || new.data::text,
    'sha256'), 'hex');
  return new;
end $$;
create trigger audit_chain before insert on public.audit_log for each row execute function public.audit_chain();

create or replace function public.forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = '42501'; end $$;
create trigger audit_no_update before update or delete on public.audit_log for each row execute function public.forbid_change();
create trigger audit_no_truncate before truncate on public.audit_log execute function public.forbid_change();

-- The only way to write to the log. The actor is always the signed-in user; clients cannot supply it.
create or replace function public.log_event(p_brand text, p_action text, p_detail text default '',
  p_content text default null, p_agent text default null, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_agent is not null and not public.is_service() then
    raise exception 'Only server code can log agent actions' using errcode = '42501';
  end if;
  if p_brand is not null and not public.is_service() and not public.has_role(p_brand, 'viewer') then
    raise exception 'Not a member of this brand' using errcode = '42501';
  end if;
  insert into public.audit_log (brand_id, content_id, actor, actor_agent, action, detail, data)
  values (p_brand, p_content, auth.uid(), p_agent, left(p_action, 120), left(coalesce(p_detail, ''), 2000), coalesce(p_data, '{}'::jsonb));
end $$;

-- Verify the chain has not been altered (for admins and monitoring).
create or replace function public.verify_audit_chain()
returns table (ok boolean, first_bad_id bigint) language plpgsql stable security definer set search_path = public, extensions as $$
declare r record; v_prev text := null; v_hash text;
begin
  for r in select * from public.audit_log order by id loop
    v_hash := encode(extensions.digest(
      coalesce(v_prev, '') || '|' || extract(epoch from r.at)::text || '|' || coalesce(r.brand_id, '') || '|' || coalesce(r.content_id, '') || '|' ||
      coalesce(r.actor::text, '') || '|' || coalesce(r.actor_agent, '') || '|' || r.action || '|' || r.detail || '|' || r.data::text,
      'sha256'), 'hex');
    if r.prev_hash is distinct from v_prev or r.hash <> v_hash then ok := false; first_bad_id := r.id; return next; return; end if;
    v_prev := r.hash;
  end loop;
  ok := true; first_bad_id := null; return next;
end $$;

-- ───────── Content fingerprint: exactly what an approval locks ─────────
create or replace function public.content_fingerprint(c public.content_items)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(jsonb_build_array(
    c.title, c.brand_id, c.channel, c.format, c.caption, to_jsonb(c.hashtags), to_jsonb(c.product_ids),
    to_jsonb(c.asset_ids), c.slides, c.shots, extract(epoch from c.scheduled_at))::text, 'sha256'), 'hex');
$$;

-- Approval records are immutable.
create trigger approvals_immutable before update or delete on public.approvals
  for each row execute function public.forbid_change();

-- ───────── Brand isolation for linked records ─────────
create or replace function public.check_brand_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.product_ids) pid
             where not exists (select 1 from public.products p where p.id = pid and p.brand_id = new.brand_id)) then
    raise exception 'Products must belong to brand %', new.brand_id using errcode = '23514';
  end if;
  if tg_table_name = 'content_items' and exists (select 1 from unnest(new.asset_ids) aid
             where not exists (select 1 from public.assets a where a.id = aid and a.brand_id = new.brand_id)) then
    raise exception 'Images must belong to brand %', new.brand_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger content_brand_links before insert or update on public.content_items
  for each row execute function public.check_brand_links();
create trigger campaign_brand_links before insert or update on public.campaigns
  for each row execute function public.check_brand_links();

create or replace function public.check_product_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.shopify_connections s where s.brand_id = new.brand_id and s.shop_domain = new.shop_domain) then
    raise exception 'Product store % is not the store linked to brand %', new.shop_domain, new.brand_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger products_store_lock before insert or update on public.products
  for each row execute function public.check_product_store();

create or replace function public.guard_assets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and not exists (select 1 from public.products p where p.id = new.product_id and p.brand_id = new.brand_id) then
    raise exception 'Product must belong to brand %', new.brand_id using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.approved and not public.is_service() then raise exception 'New images start unapproved' using errcode = '42501'; end if;
  elsif new.approved is distinct from old.approved then
    if not public.is_service() and not public.has_role(new.brand_id, 'approver') then
      raise exception 'Only approvers can approve images' using errcode = '42501';
    end if;
    new.approved_by := case when new.approved then auth.uid() end;
    new.approved_at := case when new.approved then now() end;
    perform public.log_event(new.brand_id, case when new.approved then 'Image approved' else 'Image approval removed' end, new.file_name);
  end if;
  return new;
end $$;
create trigger assets_guard before insert or update on public.assets for each row execute function public.guard_assets();

create or replace function public.guard_campaigns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if (tg_op = 'INSERT' and new.status <> 'Proposal' and not public.is_service())
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and not public.is_service() and not public.has_role(new.brand_id, 'approver')) then
    raise exception 'Only approvers can change campaign status' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.status = 'Approved' and old.status <> 'Approved' then
    new.approved_by := auth.uid(); new.approved_at := now();
    perform public.log_event(new.brand_id, 'Campaign approved', new.name);
  end if;
  return new;
end $$;
create trigger campaigns_guard before insert or update on public.campaigns for each row execute function public.guard_campaigns();

-- ───────── Content: approval enforcement and automatic audit trail ─────────
create or replace function public.guard_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fp text; v_ok boolean; v_via boolean := coalesce(current_setting('app.via_workflow', true), '') = 'on';
begin
  new.updated_at := now();
  v_fp := public.content_fingerprint(new);

  if tg_op = 'INSERT' then
    if new.status not in ('Idea', 'AI Draft', 'Needs Review') and not public.is_service() then
      raise exception 'New content starts as a draft' using errcode = '42501';
    end if;
    if new.created_by_agent is not null and not public.is_service() then
      raise exception 'Only server code can mark content as agent-created' using errcode = '42501';
    end if;
    perform public.log_event(new.brand_id, case when new.created_by_agent is not null then 'AI draft created' else 'Created' end,
      new.title, new.id, case when public.is_service() then new.created_by_agent end);
  else
    if new.id <> old.id or new.brand_id <> old.brand_id then raise exception 'Content cannot move between brands'; end if;
    if old.status = 'Published' and v_fp <> public.content_fingerprint(old) then
      raise exception 'Published content is locked' using errcode = '42501';
    end if;
    -- Any change to locked fields after approval removes the approval.
    if old.approval_id is not null and v_fp <> public.content_fingerprint(old) then
      new.status := 'Needs Review'; new.approval_id := null; new.client_fingerprint := null; new.publish_status := '';
      update public.publishing_jobs set state = 'cancelled', updated_at = now()
        where content_id = new.id and state in ('queued', 'manual');
      perform public.log_event(new.brand_id, 'Approval invalidated', 'Changed after approval', new.id);
    end if;
    if v_fp <> public.content_fingerprint(old) then
      new.revision := old.revision + 1;
      insert into public.content_revisions (content_id, revision, snapshot, changed_by) values (old.id, old.revision, to_jsonb(old), auth.uid());
    end if;
    -- Approved / scheduled / published / failed states only through workflow functions.
    if new.status is distinct from old.status and new.status in ('Approved', 'Scheduled', 'Published', 'Failed')
       and not v_via and not public.is_service() then
      raise exception 'Use the approval workflow to set status %', new.status using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      perform public.log_event(new.brand_id, 'Status: ' || new.status::text, coalesce(nullif(new.review_note, ''), ''), new.id);
    elsif v_fp <> public.content_fingerprint(old) then
      perform public.log_event(new.brand_id, 'Edited', 'Revision ' || new.revision, new.id);
    end if;
  end if;

  if new.status in ('Approved', 'Scheduled', 'Published') then
    select exists (select 1 from public.approvals a where a.id = new.approval_id and a.content_id = new.id and a.fingerprint = v_fp)
      into v_ok;
    if not v_ok then raise exception 'Content does not match an approval record' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create trigger content_guard before insert or update on public.content_items for each row execute function public.guard_content();

create or replace function public.content_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('Approved', 'Scheduled', 'Published') and not public.is_service() then
    raise exception 'Approved content cannot be deleted; archive it instead' using errcode = '42501';
  end if;
  perform public.log_event(old.brand_id, 'Deleted', old.title, old.id);
  return old;
end $$;
create trigger content_delete_guard before delete on public.content_items for each row execute function public.content_deleted();

-- ───────── Workflow functions (the only way to approve, schedule or publish) ─────────
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
  v_id := 'ap-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.approvals (id, content_id, brand_id, fingerprint, client_fingerprint, snapshot, approved_by)
  values (v_id, c.id, c.brand_id, public.content_fingerprint(c), p_client_fingerprint, to_jsonb(c), auth.uid());
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Approved', approval_id = v_id, client_fingerprint = p_client_fingerprint, review_note = ''
   where id = c.id;
  perform set_config('app.via_workflow', 'off', true);
  return v_id;
end $$;

create or replace function public.request_changes(p_content text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_content for update;
  if not public.has_role(c.brand_id, 'approver') then raise exception 'Only approvers can request changes' using errcode = '42501'; end if;
  if c.status not in ('Needs Review', 'AI Draft') then raise exception 'Only drafts in review can be sent back'; end if;
  update public.content_items set status = 'Changes Requested', review_note = left(coalesce(p_note, ''), 2000) where id = c.id;
end $$;

create or replace function public.reject_content(p_content text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_content for update;
  if not public.has_role(c.brand_id, 'approver') then raise exception 'Only approvers can reject' using errcode = '42501'; end if;
  if c.status in ('Scheduled', 'Published') then raise exception 'Scheduled or published content cannot be rejected'; end if;
  update public.content_items set status = 'Idea', archived = true, review_note = left(coalesce(p_note, ''), 2000), approval_id = null where id = c.id;
end $$;

create or replace function public.set_paused(p_paused boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.memberships where user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can pause publishing' using errcode = '42501';
  end if;
  update public.settings set paused = p_paused, changed_by = auth.uid(), changed_at = now();
  perform public.log_event(null, case when p_paused then 'Publishing paused' else 'Publishing resumed' end);
end $$;

-- Manual scheduling in Later (the workflow until a direct publishing integration is switched on).
create or replace function public.mark_scheduled_manual(p_content text, p_platform text default 'later-manual')
returns bigint language plpgsql security definer set search_path = public as $$
declare c public.content_items; v_job bigint;
begin
  if (select paused from public.settings) then raise exception 'Publishing is paused'; end if;
  select * into c from public.content_items where id = p_content for update;
  if not public.can_publish(c.brand_id) then raise exception 'You do not have publishing permission' using errcode = '42501'; end if;
  if c.status <> 'Approved' then raise exception 'Only approved content can be scheduled'; end if;
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
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Published', published_at = now(), external_post_url = p_post_url,
         publish_status = 'Posted — confirmed manually' where id = c.id;
  update public.publishing_jobs set state = 'confirmed', updated_at = now() where content_id = c.id and approval_id = c.approval_id;
  perform set_config('app.via_workflow', 'off', true);
end $$;

create or replace function public.mark_failed(p_content text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_content for update;
  if not public.can_publish(c.brand_id) then raise exception 'You do not have publishing permission' using errcode = '42501'; end if;
  if c.status not in ('Approved', 'Scheduled') then raise exception 'Only scheduled content can fail'; end if;
  perform set_config('app.via_workflow', 'on', true);
  update public.content_items set status = 'Failed', publish_status = left(coalesce(p_reason, 'Failed'), 500) where id = c.id;
  update public.publishing_jobs set state = 'failed', last_error = p_reason, updated_at = now() where content_id = c.id and state in ('queued', 'manual', 'sending');
  perform set_config('app.via_workflow', 'off', true);
end $$;

create or replace function public.retry_content(p_content text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_content for update;
  if not public.can_publish(c.brand_id) then raise exception 'You do not have publishing permission' using errcode = '42501'; end if;
  if c.status <> 'Failed' then raise exception 'Only failed content can be retried'; end if;
  perform set_config('app.via_workflow', 'on', true);
  if exists (select 1 from public.approvals a where a.id = c.approval_id and a.fingerprint = public.content_fingerprint(c)) then
    update public.content_items set status = 'Approved', publish_status = '' where id = c.id;
  else
    update public.content_items set status = 'Needs Review', approval_id = null, publish_status = '' where id = c.id;
  end if;
  perform set_config('app.via_workflow', 'off', true);
  delete from public.publishing_jobs where content_id = c.id and state = 'failed';
end $$;

-- ───────── Background job queue ─────────
create or replace function public.enqueue_job(p_type text, p_brand text, p_payload jsonb default '{}'::jsonb,
  p_dedupe text default null, p_run_after timestamptz default now())
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_service() then
    if p_type = 'shopify.sync' and not public.has_role(p_brand, 'approver') then raise exception 'Only approvers can sync products' using errcode = '42501'; end if;
    if p_type in ('ai.plan', 'ai.generate') and not public.has_role(p_brand, 'contributor') then raise exception 'Contributors and above can run the AI' using errcode = '42501'; end if;
    if p_type = 'publish.instagram' then raise exception 'Live publishing is not enabled' using errcode = '42501'; end if;
  end if;
  insert into public.jobs (type, brand_id, payload, dedupe_key, run_after) values (p_type, p_brand, p_payload, p_dedupe, p_run_after)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running') do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.jobs where dedupe_key = p_dedupe and status in ('queued', 'running'); end if;
  return v_id;
end $$;

create or replace function public.claim_jobs(p_worker text, p_limit int default 3)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
begin
  if not public.is_service() then raise exception 'Workers only' using errcode = '42501'; end if;
  -- Reclaim jobs whose worker died (locked for more than 15 minutes).
  update public.jobs set status = 'queued', locked_at = null, locked_by = null
   where status = 'running' and locked_at < now() - interval '15 minutes';
  return query
  update public.jobs j set status = 'running', locked_at = now(), locked_by = p_worker, attempts = j.attempts + 1, updated_at = now()
   where j.id in (select id from public.jobs where status = 'queued' and run_after <= now()
                  order by run_after, id limit p_limit for update skip locked)
  returning j.*;
end $$;

create or replace function public.finish_job(p_id bigint, p_ok boolean, p_result jsonb default null, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare j public.jobs;
begin
  if not public.is_service() then raise exception 'Workers only' using errcode = '42501'; end if;
  select * into j from public.jobs where id = p_id for update;
  if p_ok then
    update public.jobs set status = 'succeeded', result = p_result, last_error = null, locked_at = null, updated_at = now() where id = p_id;
  elsif j.attempts >= j.max_attempts then
    update public.jobs set status = 'dead', last_error = p_error, locked_at = null, updated_at = now() where id = p_id;
    perform public.log_event(j.brand_id, 'Background job failed', j.type || ': ' || coalesce(p_error, ''), null, 'system');
  else
    update public.jobs set status = 'queued', last_error = p_error, locked_at = null, locked_by = null,
           run_after = now() + (interval '1 minute' * power(4, j.attempts)), updated_at = now() where id = p_id;
  end if;
end $$;

-- ───────── New users get a profile ─────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────── Row level security ─────────
alter table public.brands enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.settings enable row level security;
alter table public.shopify_connections enable row level security;
alter table public.shopify_tokens enable row level security;
alter table public.products enable row level security;
alter table public.assets enable row level security;
alter table public.campaigns enable row level security;
alter table public.content_items enable row level security;
alter table public.content_revisions enable row level security;
alter table public.approvals enable row level security;
alter table public.publishing_jobs enable row level security;
alter table public.jobs enable row level security;
alter table public.chat_messages enable row level security;
alter table public.audit_log enable row level security;

create policy brands_read on public.brands for select using (public.has_role(id, 'viewer'));
create policy brands_admin on public.brands for update using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));

create policy profiles_read on public.profiles for select using (
  id = auth.uid() or exists (select 1 from public.memberships a join public.memberships b on a.brand_id = b.brand_id
                             where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_read on public.memberships for select using (user_id = auth.uid() or public.has_role(brand_id, 'admin'));
create policy memberships_admin_ins on public.memberships for insert with check (public.has_role(brand_id, 'admin'));
create policy memberships_admin_upd on public.memberships for update using (public.has_role(brand_id, 'admin')) with check (public.has_role(brand_id, 'admin'));
create policy memberships_admin_del on public.memberships for delete using (public.has_role(brand_id, 'admin') and user_id <> auth.uid());

create policy settings_read on public.settings for select using (auth.uid() is not null);
create policy shop_read on public.shopify_connections for select using (public.has_role(brand_id, 'viewer'));
create policy products_read on public.products for select using (public.has_role(brand_id, 'viewer'));

create policy assets_read on public.assets for select using (public.has_role(brand_id, 'viewer'));
create policy assets_ins on public.assets for insert with check (public.has_role(brand_id, 'contributor'));
create policy assets_upd on public.assets for update using (public.has_role(brand_id, 'contributor')) with check (public.has_role(brand_id, 'contributor'));
create policy assets_del on public.assets for delete using (public.has_role(brand_id, 'approver'));

create policy campaigns_read on public.campaigns for select using (public.has_role(brand_id, 'viewer'));
create policy campaigns_ins on public.campaigns for insert with check (public.has_role(brand_id, 'contributor'));
create policy campaigns_upd on public.campaigns for update using (public.has_role(brand_id, 'contributor')) with check (public.has_role(brand_id, 'contributor'));
create policy campaigns_del on public.campaigns for delete using (public.has_role(brand_id, 'approver'));

create policy content_read on public.content_items for select using (public.has_role(brand_id, 'viewer'));
create policy content_ins on public.content_items for insert with check (public.has_role(brand_id, 'contributor'));
create policy content_upd on public.content_items for update using (public.has_role(brand_id, 'contributor')) with check (public.has_role(brand_id, 'contributor'));
create policy content_del on public.content_items for delete using (public.has_role(brand_id, 'approver'));

create policy revisions_read on public.content_revisions for select using (
  exists (select 1 from public.content_items c where c.id = content_id and public.has_role(c.brand_id, 'viewer')));
create policy approvals_read on public.approvals for select using (public.has_role(brand_id, 'viewer'));
create policy pubjobs_read on public.publishing_jobs for select using (public.has_role(brand_id, 'viewer'));
create policy jobs_read on public.jobs for select using (brand_id is not null and public.has_role(brand_id, 'viewer'));
create policy chat_own on public.chat_messages for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_role(brand_id, 'viewer'));
create policy audit_read on public.audit_log for select using (
  (brand_id is not null and public.has_role(brand_id, 'viewer'))
  or (brand_id is null and exists (select 1 from public.memberships where user_id = auth.uid() and role = 'admin')));

-- No direct writes to the log, approvals, products, jobs or tokens from signed-in users: no insert/update/delete
-- policies exist for them, and table privileges are removed as a second layer.
revoke insert, update, delete, truncate on public.audit_log, public.approvals, public.products, public.shopify_tokens,
  public.shopify_connections, public.jobs, public.publishing_jobs, public.settings, public.content_revisions from anon, authenticated;
revoke all on public.shopify_tokens from anon, authenticated;
revoke execute on function public.claim_jobs(text, int), public.finish_job(bigint, boolean, jsonb, text) from public, anon, authenticated;
