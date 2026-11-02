-- Lets the health check confirm the server's secret key is recognised as server code by the database.
create or replace function public.whoami() returns jsonb language sql stable as $$
  select jsonb_build_object('uid', auth.uid(), 'service', public.is_service());
$$;
