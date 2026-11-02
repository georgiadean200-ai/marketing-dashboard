-- One-off migration helper: carries an approval over from the Claude Artifact studio. Server only.
-- The approval is re-created against the imported row, so the database's own fingerprint check still applies.
create or replace function public.import_approved_content(p_content text, p_status public.content_status, p_client_fingerprint text, p_original jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare c public.content_items; v_id text;
begin
  if not public.is_service() then raise exception 'Server only' using errcode = '42501'; end if;
  if p_status not in ('Approved', 'Scheduled', 'Published') then raise exception 'Not an approved status'; end if;
  select * into c from public.content_items where id = p_content for update;
  if not found then raise exception 'Content % not found', p_content; end if;
  v_id := 'ap-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.approvals (id, content_id, brand_id, fingerprint, client_fingerprint, snapshot, approved_by, approved_at)
  values (v_id, c.id, c.brand_id, public.content_fingerprint(c), p_client_fingerprint,
          to_jsonb(c) || jsonb_build_object('imported_from_artifact', p_original), null,
          coalesce(nullif(p_original ->> 'approvedAt', '')::timestamptz, now()));
  update public.content_items set status = p_status, approval_id = v_id, client_fingerprint = p_client_fingerprint where id = c.id;
  perform public.log_event(c.brand_id, 'Approval imported', 'Approved in the Claude Artifact studio', c.id, 'artifact-import', p_original);
  return v_id;
end $$;
revoke execute on function public.import_approved_content(text, public.content_status, text, jsonb) from public, anon, authenticated;
