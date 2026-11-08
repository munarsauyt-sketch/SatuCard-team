-- Apply MANUALLY after review, on the same Supabase project used by every
-- deployment of /api/copy. This migration does not enable AI or create keys.
-- Defaults: 5 attempts/user/UTC-day, 20 attempts/project/UTC-day, 60s cooldown.
-- Only counts/timestamps/user IDs are stored, never prompts/photos/results.
begin;
create table if not exists public.ai_copy_limits (
  singleton boolean primary key default true check (singleton),
  user_daily integer not null default 5 check (user_daily between 1 and 20),
  project_daily integer not null default 20 check (project_daily between 1 and 100),
  cooldown_seconds integer not null default 60 check (cooldown_seconds between 60 and 3600)
);
insert into public.ai_copy_limits(singleton) values(true) on conflict do nothing;
create table if not exists public.ai_copy_daily_usage (
  usage_day date primary key,
  attempts integer not null default 0 check (attempts >= 0)
);
create table if not exists public.ai_copy_user_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  usage_day date not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt timestamptz not null
);
alter table public.ai_copy_limits enable row level security;
alter table public.ai_copy_daily_usage enable row level security;
alter table public.ai_copy_user_usage enable row level security;
revoke all on public.ai_copy_limits, public.ai_copy_daily_usage, public.ai_copy_user_usage from public, anon, authenticated, service_role;

create or replace function public.reserve_ai_copy_attempt(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  at_time timestamptz;
  today date;
  limits public.ai_copy_limits%rowtype;
  user_usage public.ai_copy_user_usage%rowtype;
  global_attempts integer;
begin
  if p_user_id is null then raise exception 'Missing user'; end if;
  -- A singleton row lock serializes checks AND increments across all instances.
  -- Clock is read AFTER lock acquisition to keep UTC rollover/cooldown correct.
  select * into strict limits from public.ai_copy_limits where singleton = true for update;
  at_time := clock_timestamp();
  today := (at_time at time zone 'UTC')::date;
  insert into public.ai_copy_daily_usage(usage_day) values(today) on conflict do nothing;
  select attempts into strict global_attempts from public.ai_copy_daily_usage where usage_day = today;
  select * into user_usage from public.ai_copy_user_usage where user_id = p_user_id;
  if global_attempts >= limits.project_daily or
     (user_usage.usage_day = today and user_usage.attempts >= limits.user_daily) or
     user_usage.last_attempt > at_time - pg_catalog.make_interval(secs => limits.cooldown_seconds) then
    return jsonb_build_object('allowed', false);
  end if;
  update public.ai_copy_daily_usage set attempts = attempts + 1 where usage_day = today;
  insert into public.ai_copy_user_usage(user_id, usage_day, attempts, last_attempt)
    values(p_user_id, today, 1, at_time)
    on conflict (user_id) do update set
      usage_day = excluded.usage_day,
      attempts = case when public.ai_copy_user_usage.usage_day = excluded.usage_day then public.ai_copy_user_usage.attempts + 1 else 1 end,
      last_attempt = excluded.last_attempt;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.reserve_ai_copy_attempt(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_copy_attempt(uuid) to service_role;
commit;
