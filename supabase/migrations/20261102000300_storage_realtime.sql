-- TTC Marketing Studio · media storage and live updates

-- Private bucket for product photography and creative. Paths are <brand>/<file>.
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;

create policy media_read on storage.objects for select
  using (bucket_id = 'media' and public.has_role((storage.foldername(name))[1], 'viewer'));
create policy media_upload on storage.objects for insert
  with check (bucket_id = 'media' and public.has_role((storage.foldername(name))[1], 'contributor'));
create policy media_delete on storage.objects for delete
  using (bucket_id = 'media' and public.has_role((storage.foldername(name))[1], 'approver'));

-- Live updates for the dashboard (calendar, queue, activity) across devices.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.content_items, public.approvals, public.audit_log,
      public.campaigns, public.assets, public.settings, public.shopify_connections, public.jobs;
  end if;
end $$;
