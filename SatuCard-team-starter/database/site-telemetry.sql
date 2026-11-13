-- Repeatable migration for anonymous live online presence and daily traffic statistics.
begin;

create table if not exists public.site_presence (
  session_id text primary key check (char_length(session_id) between 8 and 80),
  visitor_id text not null check (char_length(visitor_id) between 8 and 80),
  path text not null check (char_length(path) between 1 and 120),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  last_seen_at timestamptz not null default now()
);

create index if not exists site_presence_last_seen_idx on public.site_presence (last_seen_at desc);

create table if not exists public.site_traffic_daily (
  day date not null default (now() at time zone 'Asia/Almaty')::date,
  path text not null check (char_length(path) between 1 and 120),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  views integer not null default 0 check (views >= 0),
  primary key (day, path, device)
);

create table if not exists public.site_visitors_daily (
  day date not null default (now() at time zone 'Asia/Almaty')::date,
  visitor_id text not null check (char_length(visitor_id) between 8 and 80),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  views integer not null default 1 check (views >= 1),
  primary key (day, visitor_id)
);

create index if not exists site_visitors_daily_day_idx on public.site_visitors_daily (day desc);

create table if not exists public.site_monitor_config (
  id integer primary key default 1 check (id = 1),
  token_hash text not null check (char_length(token_hash) = 64),
  updated_at timestamptz not null default now()
);

alter table public.site_presence enable row level security;
alter table public.site_presence force row level security;
alter table public.site_traffic_daily enable row level security;
alter table public.site_traffic_daily force row level security;
alter table public.site_visitors_daily enable row level security;
alter table public.site_visitors_daily force row level security;
alter table public.site_monitor_config enable row level security;
alter table public.site_monitor_config force row level security;

revoke all on public.site_presence from public, anon, authenticated;
revoke all on public.site_traffic_daily from public, anon, authenticated;
revoke all on public.site_visitors_daily from public, anon, authenticated;
revoke all on public.site_monitor_config from public, anon, authenticated;

grant select, insert, update, delete on public.site_presence to service_role;
grant select, insert, update, delete on public.site_traffic_daily to service_role;
grant select, insert, update, delete on public.site_visitors_daily to service_role;
grant select, insert, update, delete on public.site_monitor_config to service_role;

create or replace function public.record_site_heartbeat(
  p_session_id text,
  p_visitor_id text,
  p_path text,
  p_device text,
  p_is_pageview boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Almaty')::date;
begin
  delete from public.site_presence
  where last_seen_at < now() - interval '15 minutes';

  insert into public.site_presence (session_id, visitor_id, path, device, last_seen_at)
  values (p_session_id, p_visitor_id, p_path, p_device, now())
  on conflict (session_id) do update
    set visitor_id = excluded.visitor_id,
        path = excluded.path,
        device = excluded.device,
        last_seen_at = now();

  if p_is_pageview then
    insert into public.site_traffic_daily (day, path, device, views)
    values (v_today, p_path, p_device, 1)
    on conflict (day, path, device) do update
      set views = public.site_traffic_daily.views + 1;

    insert into public.site_visitors_daily (day, visitor_id, device, first_seen_at, last_seen_at, views)
    values (v_today, p_visitor_id, p_device, now(), now(), 1)
    on conflict (day, visitor_id) do update
      set device = excluded.device,
          last_seen_at = now(),
          views = public.site_visitors_daily.views + 1;
  else
    insert into public.site_visitors_daily (day, visitor_id, device, first_seen_at, last_seen_at, views)
    values (v_today, p_visitor_id, p_device, now(), now(), 1)
    on conflict (day, visitor_id) do update
      set last_seen_at = now();
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_site_heartbeat(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_site_heartbeat(text, text, text, text, boolean) to service_role;

create or replace function public.get_site_telemetry_summary(p_token_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Almaty')::date;
  v_expected_hash text;
  v_online_count integer;
  v_online_by_page jsonb;
  v_online_by_device jsonb;
  v_active_sessions jsonb;
  v_today_visitors integer;
  v_today_views integer;
  v_7d_visitors integer;
  v_7d_views integer;
  v_30d_visitors integer;
  v_30d_views integer;
  v_devices_30d jsonb;
  v_top_pages_30d jsonb;
  v_daily_series jsonb;
  v_total_users integer := 0;
  v_total_cards integer := 0;
begin
  if p_token_hash is not null then
    select token_hash into v_expected_hash from public.site_monitor_config where id = 1;
    if v_expected_hash is null or v_expected_hash <> p_token_hash then
      return jsonb_build_object('authorized', false);
    end if;
  end if;

  delete from public.site_presence where last_seen_at < now() - interval '15 minutes';

  select count(*)::int into v_online_count
  from public.site_presence
  where last_seen_at >= now() - interval '90 seconds';

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_online_by_page
  from (
    select path, count(*)::int as count
    from public.site_presence
    where last_seen_at >= now() - interval '90 seconds'
    group by path
    order by count desc, path asc
  ) t;

  select coalesce(jsonb_object_agg(device, cnt), '{}'::jsonb) into v_online_by_device
  from (
    select device, count(*)::int as cnt
    from public.site_presence
    where last_seen_at >= now() - interval '90 seconds'
    group by device
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_active_sessions
  from (
    select
      left(session_id, 8) as id,
      path,
      device,
      greatest(0, extract(epoch from (now() - last_seen_at))::int) as seconds_ago
    from public.site_presence
    where last_seen_at >= now() - interval '90 seconds'
    order by last_seen_at desc
    limit 50
  ) t;

  select count(distinct visitor_id)::int into v_today_visitors
  from public.site_visitors_daily where day = v_today;

  select coalesce(sum(views), 0)::int into v_today_views
  from public.site_traffic_daily where day = v_today;

  select count(distinct visitor_id)::int into v_7d_visitors
  from public.site_visitors_daily where day >= v_today - 6;

  select coalesce(sum(views), 0)::int into v_7d_views
  from public.site_traffic_daily where day >= v_today - 6;

  select count(distinct visitor_id)::int into v_30d_visitors
  from public.site_visitors_daily where day >= v_today - 29;

  select coalesce(sum(views), 0)::int into v_30d_views
  from public.site_traffic_daily where day >= v_today - 29;

  select coalesce(jsonb_object_agg(device, cnt), '{}'::jsonb) into v_devices_30d
  from (
    select device, count(distinct visitor_id)::int as cnt
    from public.site_visitors_daily
    where day >= v_today - 29
    group by device
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_top_pages_30d
  from (
    select path, sum(views)::int as views
    from public.site_traffic_daily
    where day >= v_today - 29
    group by path
    order by views desc, path asc
    limit 15
  ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_daily_series
  from (
    select
      d.day::text as day,
      coalesce(v.visitors, 0)::int as visitors,
      coalesce(p.views, 0)::int as views
    from (
      select (v_today - 13 + g)::date as day
      from generate_series(0, 13) as g
    ) d
    left join (
      select day, count(distinct visitor_id)::int as visitors
      from public.site_visitors_daily
      where day >= v_today - 13
      group by day
    ) v on v.day = d.day
    left join (
      select day, sum(views)::int as views
      from public.site_traffic_daily
      where day >= v_today - 13
      group by day
    ) p on p.day = d.day
    order by d.day asc
  ) t;

  if to_regclass('public.profiles') is not null then
    execute 'select count(*)::int from public.profiles' into v_total_users;
  end if;
  if to_regclass('public.cards') is not null then
    execute 'select count(*)::int from public.cards' into v_total_cards;
  end if;

  return jsonb_build_object(
    'authorized', true,
    'timestamp', now(),
    'online', jsonb_build_object(
      'total', v_online_count,
      'byPage', v_online_by_page,
      'byDevice', v_online_by_device,
      'sessions', v_active_sessions
    ),
    'traffic', jsonb_build_object(
      'today', jsonb_build_object('visitors', v_today_visitors, 'views', v_today_views),
      'days7', jsonb_build_object('visitors', v_7d_visitors, 'views', v_7d_views),
      'days30', jsonb_build_object('visitors', v_30d_visitors, 'views', v_30d_views),
      'devices30d', v_devices_30d,
      'topPages30d', v_top_pages_30d,
      'dailySeries', v_daily_series
    ),
    'product', jsonb_build_object(
      'totalUsers', v_total_users,
      'totalPublishedCards', v_total_cards
    )
  );
end;
$$;

revoke all on function public.get_site_telemetry_summary(text) from public, anon, authenticated;
grant execute on function public.get_site_telemetry_summary(text) to service_role;

commit;
