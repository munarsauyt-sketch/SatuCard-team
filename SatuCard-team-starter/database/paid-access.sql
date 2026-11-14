-- Apply after review in the application's Supabase project. This migration
-- creates private billing records and quotas, without enabling a payment rail.
begin;

create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id),
  last_attempt_at timestamptz
);
create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_accounts(user_id),
  request_id uuid not null,
  plan_id text not null check (plan_id in ('basic', 'plus', 'max', 'max3', 'niche10')),
  amount_kzt integer not null check (amount_kzt > 0),
  token_limit bigint not null check (token_limit > 0),
  tier integer not null check (tier between 1 and 3),
  duration_days integer not null check (duration_days = 30),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'rejected')),
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  payment_ref text unique,
  cancelled_at timestamptz,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id),
  rejection_reason text,
  unique (user_id, request_id),
  unique (id, user_id)
);
create index if not exists billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);
create index if not exists billing_orders_pending_idx on public.billing_orders(created_at desc) where status = 'pending';
create table if not exists public.billing_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.billing_accounts(user_id),
  order_id uuid not null unique,
  plan_id text not null,
  tier integer not null check (tier between 1 and 3),
  token_limit bigint not null check (token_limit > 0),
  tokens_used bigint not null default 0 check (tokens_used >= 0),
  tokens_reserved bigint not null default 0 check (tokens_reserved >= 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > starts_at),
  check (tokens_reserved <= token_limit and tokens_used <= token_limit - tokens_reserved),
  foreign key (order_id, user_id) references public.billing_orders(id, user_id),
  unique (id, user_id)
);
create index if not exists billing_grants_user_period_idx on public.billing_grants(user_id, expires_at desc)
  where revoked_at is null;
create table if not exists public.paid_ai_limits (
  singleton boolean primary key default true check (singleton),
  daily_provider_units bigint not null default 20000000 check (daily_provider_units > 0)
);
insert into public.paid_ai_limits(singleton) values(true) on conflict do nothing;
create table if not exists public.paid_ai_daily_usage (
  usage_day date primary key,
  units bigint not null default 0 check (units >= 0)
);
create table if not exists public.paid_ai_reservations (
  request_id uuid primary key,
  user_id uuid not null references public.billing_accounts(user_id),
  grant_id uuid not null,
  model_id text not null,
  multiplier_hundredths integer not null check (multiplier_hundredths > 0),
  token_cap bigint not null check (token_cap > 0),
  provider_cap_units bigint not null check (provider_cap_units > 0),
  usage_day date not null references public.paid_ai_daily_usage(usage_day),
  total_tokens bigint,
  outcome text not null default 'pending',
  created_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  foreign key (grant_id, user_id) references public.billing_grants(id, user_id),
  check (total_tokens is null or total_tokens between 0 and token_cap),
  check ((outcome = 'pending' and total_tokens is null and settled_at is null) or
         (outcome <> 'pending' and total_tokens is not null and settled_at is not null))
);
create index if not exists paid_ai_inflight_idx on public.paid_ai_reservations(user_id, created_at)
  where outcome = 'pending';

alter table public.billing_accounts enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_grants enable row level security;
alter table public.paid_ai_limits enable row level security;
alter table public.paid_ai_daily_usage enable row level security;
alter table public.paid_ai_reservations enable row level security;
revoke all on public.billing_accounts, public.billing_orders, public.billing_grants,
  public.paid_ai_limits, public.paid_ai_daily_usage, public.paid_ai_reservations
  from public, anon, authenticated, service_role;

create or replace function public.create_billing_order(p_user_id uuid, p_plan_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved public.billing_orders%rowtype;
  amount integer;
  allowance bigint;
  plan_tier integer;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'Invalid billing request' using errcode = '22023';
  end if;
  case p_plan_id
    when 'basic' then amount := 1500; allowance := 5000000; plan_tier := 1;
    when 'plus' then amount := 2990; allowance := 8000000; plan_tier := 2;
    when 'max' then amount := 4990; allowance := 10000000; plan_tier := 3;
    when 'max3' then amount := 9990; allowance := 30000000; plan_tier := 3;
    when 'niche10' then amount := 490; allowance := 1; plan_tier := 1;
    else raise exception 'Unknown plan' using errcode = '22023';
  end case;
  insert into public.billing_accounts(user_id) values(p_user_id) on conflict do nothing;
  perform 1 from public.billing_accounts where user_id = p_user_id for update;
  select * into saved from public.billing_orders where user_id = p_user_id and request_id = p_request_id;
  if found then
    if saved.plan_id <> p_plan_id then
      raise exception 'Idempotency key belongs to another plan' using errcode = '22023';
    end if;
    return jsonb_build_object('order', to_jsonb(saved));
  end if;
  insert into public.billing_orders(user_id, request_id, plan_id, amount_kzt, token_limit, tier, duration_days)
    values(p_user_id, p_request_id, p_plan_id, amount, allowance, plan_tier, 30) returning * into saved;
  return jsonb_build_object('order', to_jsonb(saved));
end;
$$;

create or replace function public.confirm_billing_order(
  p_order_id uuid, p_admin_user_id uuid, p_payment_ref text, p_received_amount integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer uuid;
  saved public.billing_orders%rowtype;
  access public.billing_grants%rowtype;
  starts timestamptz;
  at_time timestamptz;
  reference text := btrim(p_payment_ref);
begin
  if p_order_id is null or p_admin_user_id is null or reference is null or
     char_length(reference) not between 1 and 160 or p_received_amount is null then
    raise exception 'Invalid payment confirmation' using errcode = '22023';
  end if;
  select user_id into customer from public.billing_orders where id = p_order_id;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform 1 from public.billing_accounts where user_id = customer for update;
  select * into strict saved from public.billing_orders where id = p_order_id for update;
  if saved.amount_kzt <> p_received_amount then
    raise exception 'Payment amount does not match order' using errcode = '22023';
  end if;
  if saved.status = 'confirmed' then
    if saved.payment_ref <> reference then raise exception 'Payment reference mismatch' using errcode = '22023'; end if;
    select * into strict access from public.billing_grants where order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(saved), 'grant', to_jsonb(access));
  end if;
  if saved.status <> 'pending' then raise exception 'Order is not pending' using errcode = '22023'; end if;
  at_time := clock_timestamp();
  select greatest(at_time, coalesce(max(expires_at), at_time)) into starts
    from public.billing_grants where user_id = customer and revoked_at is null;
  update public.billing_orders set status = 'confirmed', confirmed_at = at_time,
    confirmed_by = p_admin_user_id, payment_ref = reference where id = p_order_id returning * into saved;
  insert into public.billing_grants(user_id, order_id, plan_id, tier, token_limit, starts_at, expires_at)
    values(customer, saved.id, saved.plan_id, saved.tier, saved.token_limit, starts, starts + interval '720 hours')
    returning * into access;
  return jsonb_build_object('order', to_jsonb(saved), 'grant', to_jsonb(access));
end;
$$;

create or replace function public.cancel_billing_order(p_user_id uuid, p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.billing_orders%rowtype;
begin
  perform 1 from public.billing_accounts where user_id = p_user_id for update;
  select * into saved from public.billing_orders where id = p_order_id and user_id = p_user_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if saved.status = 'cancelled' then return jsonb_build_object('order', to_jsonb(saved)); end if;
  if saved.status <> 'pending' then raise exception 'Order is not pending' using errcode = '22023'; end if;
  update public.billing_orders set status = 'cancelled', cancelled_at = clock_timestamp()
    where id = saved.id returning * into saved;
  return jsonb_build_object('order', to_jsonb(saved));
end;
$$;

create or replace function public.reject_billing_order(p_order_id uuid, p_admin_user_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer uuid;
  saved public.billing_orders%rowtype;
begin
  if p_admin_user_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Invalid rejection reason' using errcode = '22023';
  end if;
  select user_id into customer from public.billing_orders where id = p_order_id;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  perform 1 from public.billing_accounts where user_id = customer for update;
  select * into strict saved from public.billing_orders where id = p_order_id for update;
  if saved.status <> 'pending' then raise exception 'Order is not pending' using errcode = '22023'; end if;
  update public.billing_orders set status = 'rejected', rejected_at = clock_timestamp(),
    rejected_by = p_admin_user_id, rejection_reason = btrim(p_reason) where id = p_order_id returning * into saved;
  return jsonb_build_object('order', to_jsonb(saved));
end;
$$;

create or replace function public.get_billing_status(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  at_time timestamptz := clock_timestamp();
  active jsonb;
  scheduled jsonb;
  orders jsonb;
begin
  select to_jsonb(g) into active from public.billing_grants g
    where user_id = p_user_id and revoked_at is null and starts_at <= at_time and expires_at > at_time
    order by starts_at desc limit 1;
  select coalesce(jsonb_agg(to_jsonb(g) order by starts_at), '[]'::jsonb) into scheduled
    from public.billing_grants g where user_id = p_user_id and revoked_at is null and starts_at > at_time;
  select coalesce(jsonb_agg(to_jsonb(o) order by created_at desc, id desc), '[]'::jsonb) into orders
    from (select * from public.billing_orders where user_id = p_user_id order by created_at desc, id desc limit 20) o;
  return jsonb_build_object('active', active, 'scheduled', scheduled, 'orders', orders);
end;
$$;

create or replace function public.get_billing_admin_queue()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('orders', coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc, q.id desc), '[]'::jsonb))
  from (
    select o.*, u.email from public.billing_orders o join auth.users u on u.id = o.user_id
    where o.status = 'pending' order by o.created_at desc, o.id desc limit 30
  ) q;
$$;

create or replace function public.reserve_paid_ai_attempt(
  p_user_id uuid, p_request_id uuid, p_model_id text, p_token_cap bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  account public.billing_accounts%rowtype;
  limits public.paid_ai_limits%rowtype;
  access public.billing_grants%rowtype;
  stale public.paid_ai_reservations%rowtype;
  at_time timestamptz;
  today date;
  min_tier integer;
  coefficient integer;
  daily_units bigint;
  reserve_units numeric;
begin
  if p_user_id is null or p_request_id is null or p_token_cap is null or p_token_cap <= 0 then
    raise exception 'Invalid quota reservation' using errcode = '22023';
  end if;
  case p_model_id
    when 'ag/gemini-2.5-flash' then min_tier := 1; coefficient := 60;
    when 'cx/gpt-6-luna' then min_tier := 1; coefficient := 75;
    when 'cc/claude-sonnet-5-5' then min_tier := 1; coefficient := 180;
    when 'cx/gpt-6.1-terra' then min_tier := 2; coefficient := 150;
    when 'cx/gpt-6-sol' then min_tier := 2; coefficient := 200;
    when 'cc/claude-opus-4-8' then min_tier := 2; coefficient := 400;
    when 'cx/gpt-6-astra' then min_tier := 3; coefficient := 400;
    when 'cx/gpt-6.1-sol' then min_tier := 3; coefficient := 200;
    when 'cc/claude-opus-5-5' then min_tier := 3; coefficient := 600;
    else return jsonb_build_object('allowed', false, 'code', 'model_unavailable');
  end case;
  select * into account from public.billing_accounts where user_id = p_user_id for update;
  if not found then return jsonb_build_object('allowed', false, 'code', 'access_expired'); end if;
  -- Every quota mutation takes account -> global config -> grant/request locks.
  select * into strict limits from public.paid_ai_limits where singleton = true for update;
  at_time := clock_timestamp();
  today := (at_time at time zone 'UTC')::date;
  -- A crashed caller cannot occupy both inflight slots forever. Its uncertain
  -- cost remains charged in full, including on the original provider usage day.
  for stale in select * from public.paid_ai_reservations
    where user_id = p_user_id and outcome = 'pending' and created_at < at_time - interval '2 minutes'
    order by created_at for update
  loop
    update public.billing_grants set tokens_reserved = tokens_reserved - stale.token_cap,
      tokens_used = tokens_used + stale.token_cap where id = stale.grant_id;
    update public.paid_ai_reservations set outcome = 'uncertain', total_tokens = token_cap, settled_at = at_time
      where request_id = stale.request_id;
  end loop;
  if exists(select 1 from public.paid_ai_reservations where request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'code', 'duplicate_request');
  end if;
  select * into access from public.billing_grants
    where user_id = p_user_id and revoked_at is null and starts_at <= at_time and expires_at > at_time
    order by starts_at desc limit 1 for update;
  if not found then return jsonb_build_object('allowed', false, 'code', 'access_expired'); end if;
  if access.tier < min_tier then return jsonb_build_object('allowed', false, 'code', 'plan_required'); end if;
  if (select count(*) from public.paid_ai_reservations where user_id = p_user_id and outcome = 'pending') >= 2 then
    return jsonb_build_object('allowed', false, 'code', 'ai_busy');
  end if;
  if account.last_attempt_at > at_time - interval '2 seconds' then
    return jsonb_build_object('allowed', false, 'code', 'ai_cooldown');
  end if;
  if p_token_cap > access.token_limit - access.tokens_used - access.tokens_reserved then
    return jsonb_build_object('allowed', false, 'code', 'paid_quota_exceeded');
  end if;
  reserve_units := ceil(p_token_cap::numeric * coefficient / 100);
  select units into daily_units from public.paid_ai_daily_usage where usage_day = today;
  daily_units := coalesce(daily_units, 0);
  if reserve_units > limits.daily_provider_units - daily_units then
    return jsonb_build_object('allowed', false, 'code', 'provider_daily_limit');
  end if;
  insert into public.paid_ai_daily_usage(usage_day, units) values(today, reserve_units::bigint)
    on conflict (usage_day) do update set units = public.paid_ai_daily_usage.units + excluded.units;
  update public.billing_grants set tokens_reserved = tokens_reserved + p_token_cap where id = access.id;
  insert into public.paid_ai_reservations(request_id, user_id, grant_id, model_id, multiplier_hundredths,
    token_cap, provider_cap_units, usage_day)
    values(p_request_id, p_user_id, access.id, p_model_id, coefficient, p_token_cap, reserve_units::bigint, today);
  update public.billing_accounts set last_attempt_at = at_time where user_id = p_user_id;
  return jsonb_build_object('allowed', true, 'reservation_id', p_request_id);
end;
$$;

create or replace function public.settle_paid_ai_attempt(p_request_id uuid, p_total_tokens bigint, p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer uuid;
  access_id uuid;
  saved public.paid_ai_reservations%rowtype;
  actual bigint;
  actual_units bigint;
  refund bigint;
begin
  if p_request_id is null or (p_total_tokens is not null and p_total_tokens < 0) or
     p_outcome is null or p_outcome !~ '^[a-z_]{1,40}$' or p_outcome = 'pending' then
    raise exception 'Invalid quota settlement' using errcode = '22023';
  end if;
  select user_id, grant_id into customer, access_id from public.paid_ai_reservations where request_id = p_request_id;
  if not found then return jsonb_build_object('settled', false); end if;
  perform 1 from public.billing_accounts where user_id = customer for update;
  perform 1 from public.paid_ai_limits where singleton = true for update;
  if not found then raise exception 'Quota state unavailable'; end if;
  perform 1 from public.billing_grants where id = access_id for update;
  select * into strict saved from public.paid_ai_reservations where request_id = p_request_id for update;
  if p_total_tokens > saved.token_cap then raise exception 'Usage exceeds reservation' using errcode = '22023'; end if;
  if saved.outcome <> 'pending' then return jsonb_build_object('settled', true); end if;
  actual := coalesce(p_total_tokens, saved.token_cap);
  actual_units := ceil(actual::numeric * saved.multiplier_hundredths / 100)::bigint;
  refund := saved.provider_cap_units - actual_units;
  update public.paid_ai_daily_usage set units = units - refund
    where usage_day = saved.usage_day and units >= refund;
  if not found then raise exception 'Quota state unavailable'; end if;
  update public.billing_grants set tokens_reserved = tokens_reserved - saved.token_cap,
    tokens_used = tokens_used + actual where id = saved.grant_id;
  update public.paid_ai_reservations set total_tokens = actual,
    outcome = case when p_total_tokens is null then 'uncertain' else p_outcome end,
    settled_at = clock_timestamp() where request_id = p_request_id;
  return jsonb_build_object('settled', true);
end;
$$;

revoke all on function public.create_billing_order(uuid,text,uuid),
  public.confirm_billing_order(uuid,uuid,text,integer), public.cancel_billing_order(uuid,uuid),
  public.reject_billing_order(uuid,uuid,text), public.get_billing_status(uuid), public.get_billing_admin_queue(),
  public.reserve_paid_ai_attempt(uuid,uuid,text,bigint), public.settle_paid_ai_attempt(uuid,bigint,text)
  from public, anon, authenticated;
grant execute on function public.create_billing_order(uuid,text,uuid),
  public.confirm_billing_order(uuid,uuid,text,integer), public.cancel_billing_order(uuid,uuid),
  public.reject_billing_order(uuid,uuid,text), public.get_billing_status(uuid), public.get_billing_admin_queue(),
  public.reserve_paid_ai_attempt(uuid,uuid,text,bigint), public.settle_paid_ai_attempt(uuid,bigint,text)
  to service_role;
commit;
