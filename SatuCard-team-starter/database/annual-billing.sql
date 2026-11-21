-- Apply AFTER free-templates-upgrade.sql. No live database changes are made by the app.
-- Annual: 12 calendar months in UTC, separate quota per month, no rollover. Repeatable.
begin;
alter table public.billing_orders drop constraint if exists billing_orders_plan_id_check;
alter table public.billing_orders add constraint billing_orders_plan_id_check check
 (plan_id in ('basic','plus','max','max3','niche10','basic_yearly','plus_yearly','max_yearly','max3_yearly'));
alter table public.billing_orders add column if not exists period_count integer not null default 1 check (period_count in (1,12));
alter table public.billing_grants add column if not exists period_number integer not null default 1 check (period_number between 1 and 12);
alter table public.billing_grants drop constraint if exists billing_grants_order_id_key;
create unique index if not exists billing_grants_order_period_key on public.billing_grants(order_id, period_number);


create or replace function public.create_billing_order(p_user_id uuid, p_plan_id text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  saved public.billing_orders%rowtype;
  amount integer;
  allowance bigint;
  plan_tier integer;
  periods integer := case when p_plan_id like '%_yearly' then 12 else 1 end;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'Invalid billing request' using errcode = '22023';
  end if;
  if p_plan_id not in ('basic','plus','max','max3','basic_yearly','plus_yearly','max_yearly','max3_yearly') or p_plan_id is null then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  case replace(p_plan_id, '_yearly', '')
    when 'basic' then amount := 1500; allowance := 5000000; plan_tier := 1;
    when 'plus' then amount := 2990; allowance := 8000000; plan_tier := 2;
    when 'max' then amount := 4990; allowance := 10000000; plan_tier := 3;
    when 'max3' then amount := 9990; allowance := 30000000; plan_tier := 3;
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
  insert into public.billing_orders(user_id, request_id, plan_id, amount_kzt, token_limit, tier, duration_days, period_count)
    values(p_user_id, p_request_id, p_plan_id, amount * periods, allowance, plan_tier, 30, periods) returning * into saved;
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
  period integer;
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
  if saved.plan_id not in ('basic', 'plus', 'max', 'max3', 'basic_yearly', 'plus_yearly', 'max_yearly', 'max3_yearly') then
    raise exception 'Templates are free; this order cannot be confirmed' using errcode = '22023';
  end if;
  if saved.amount_kzt <> p_received_amount then
    raise exception 'Payment amount does not match order' using errcode = '22023';
  end if;
  if saved.status = 'confirmed' then
    if saved.payment_ref <> reference then raise exception 'Payment reference mismatch' using errcode = '22023'; end if;
    select * into strict access from public.billing_grants where order_id = p_order_id and period_number = 1;
    return jsonb_build_object('order', to_jsonb(saved), 'grant', to_jsonb(access));
  end if;
  if saved.status <> 'pending' then raise exception 'Order is not pending' using errcode = '22023'; end if;
  at_time := clock_timestamp();
  select greatest(at_time, coalesce(max(expires_at), at_time)) into starts
    from public.billing_grants where user_id = customer and revoked_at is null;
  update public.billing_orders set status = 'confirmed', confirmed_at = at_time,
    confirmed_by = p_admin_user_id, payment_ref = reference where id = p_order_id returning * into saved;
  for period in 1..saved.period_count loop
    insert into public.billing_grants(user_id, order_id, plan_id, tier, token_limit, starts_at, expires_at, period_number)
    values(customer, saved.id, replace(saved.plan_id, '_yearly', ''), saved.tier, saved.token_limit,
      case when saved.period_count = 12 then ((starts at time zone 'UTC') + make_interval(months => period - 1)) at time zone 'UTC' else starts end,
      case when saved.period_count = 12 then ((starts at time zone 'UTC') + make_interval(months => period)) at time zone 'UTC' else starts + interval '720 hours' end, period);
  end loop;
  select * into strict access from public.billing_grants where order_id = p_order_id and period_number = 1;
  return jsonb_build_object('order', to_jsonb(saved), 'grant', to_jsonb(access));
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
  return jsonb_build_object('annualReady', true, 'active', active, 'scheduled', scheduled, 'orders', orders);
end;
$$;

revoke all on function public.create_billing_order(uuid,text,uuid), public.confirm_billing_order(uuid,uuid,text,integer), public.get_billing_status(uuid) from public, anon, authenticated;
grant execute on function public.create_billing_order(uuid,text,uuid), public.confirm_billing_order(uuid,uuid,text,integer), public.get_billing_status(uuid) to service_role;
commit;
