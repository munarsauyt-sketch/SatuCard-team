-- Apply after site-telemetry.sql. No raw IP addresses are stored.
begin;
create table if not exists public.site_telemetry_buckets (
  bucket timestamptz not null,
  client_key text not null,
  requests integer not null default 0,
  primary key(bucket, client_key)
);
create table if not exists public.site_telemetry_dedup (
  session_id text not null,
  path text not null,
  seen_at timestamptz not null,
  pageview_at timestamptz,
  primary key(session_id, path)
);
alter table public.site_telemetry_buckets enable row level security;
alter table public.site_telemetry_dedup enable row level security;
revoke all on public.site_telemetry_buckets, public.site_telemetry_dedup from public, anon, authenticated;

create or replace function public.record_limited_site_heartbeat(
  p_client_key text, p_session_id text, p_visitor_id text, p_path text,
  p_device text, p_is_pageview boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  at_time timestamptz := now();
  minute_at timestamptz := date_trunc('minute', at_time);
  total_count integer;
  client_count integer;
  prior public.site_telemetry_dedup%rowtype;
  count_view boolean;
begin
  if p_client_key !~ '^[a-f0-9]{64}$' or p_session_id is null or length(p_session_id) > 100 or p_path is null or length(p_path) > 100 then
    return jsonb_build_object('allowed', false);
  end if;
  -- One shared lock bounds work across all serverless instances and serializes
  -- the global/IP checks and dedup, so concurrent calls cannot bypass limits.
  perform pg_advisory_xact_lock(732491, 1);
  select requests into total_count from public.site_telemetry_buckets where bucket = minute_at and client_key = 'global';
  if coalesce(total_count, 0) >= 600 then return jsonb_build_object('allowed', false); end if;
  select requests into client_count from public.site_telemetry_buckets where bucket = minute_at and client_key = p_client_key;
  if coalesce(client_count, 0) >= 60 then return jsonb_build_object('allowed', false); end if;
  if total_count is null then
    delete from public.site_telemetry_buckets where bucket < minute_at - interval '2 minutes';
    delete from public.site_telemetry_dedup where seen_at < at_time - interval '1 day';
  end if;
  insert into public.site_telemetry_buckets(bucket, client_key, requests) values(minute_at, 'global', 1), (minute_at, p_client_key, 1)
    on conflict(bucket, client_key) do update set requests = public.site_telemetry_buckets.requests + 1;
  select * into prior from public.site_telemetry_dedup where session_id = p_session_id and path = p_path;
  if prior.seen_at > at_time - interval '15 seconds' then return jsonb_build_object('allowed', true, 'duplicate', true); end if;
  count_view := p_is_pageview and (prior.pageview_at is null or prior.pageview_at <= at_time - interval '30 seconds');
  insert into public.site_telemetry_dedup(session_id, path, seen_at, pageview_at)
    values(p_session_id, p_path, at_time, case when count_view then at_time else null end)
    on conflict(session_id, path) do update set seen_at = at_time,
      pageview_at = case when count_view then at_time else public.site_telemetry_dedup.pageview_at end;
  perform public.record_site_heartbeat(p_session_id, p_visitor_id, p_path, p_device, count_view);
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.record_limited_site_heartbeat(text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.record_limited_site_heartbeat(text,text,text,text,text,boolean) to service_role;
commit;
