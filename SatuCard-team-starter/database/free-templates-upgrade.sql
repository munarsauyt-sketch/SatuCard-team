-- Apply after paid-access.sql and pricing-v2-upgrade.sql; repeatable.
-- Templates are free. Retain payment evidence; do not issue automatic refunds.
begin;

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
  if saved.plan_id not in ('basic', 'plus', 'max', 'max3') then
    raise exception 'Templates are free; this order cannot be confirmed' using errcode = '22023';
  end if;
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

create table if not exists public.billing_schedule_repairs (
  grant_id uuid primary key references public.billing_grants(id),
  old_starts_at timestamptz not null,
  old_expires_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_expires_at timestamptz not null,
  repaired_at timestamptz not null default clock_timestamp()
);
alter table public.billing_schedule_repairs enable row level security;
revoke all on public.billing_schedule_repairs from public, anon, authenticated, service_role;

do $$
declare
  customer uuid;
  entry public.billing_grants%rowtype;
  at_time timestamptz := clock_timestamp();
  previous_end timestamptz;
  starts timestamptz;
begin
  for customer in select distinct user_id from public.billing_orders where plan_id = 'niche10' loop
    -- Same account lock as confirmation and quota reservations.
    perform 1 from public.billing_accounts where user_id = customer for update;
    update public.billing_orders set status = 'cancelled', cancelled_at = at_time,
      rejection_reason = 'Шаблоны бесплатны. Платный набор больше не продаётся.'
      where user_id = customer and plan_id = 'niche10' and status = 'pending';
    update public.billing_grants set revoked_at = at_time
      where user_id = customer and plan_id = 'niche10' and revoked_at is null;
    previous_end := at_time;
    for entry in select * from public.billing_grants
      where user_id = customer and plan_id in ('basic', 'plus', 'max', 'max3') and revoked_at is null
      order by starts_at, created_at, id for update loop
      if entry.starts_at > at_time then
        starts := greatest(at_time, previous_end);
        if starts < entry.starts_at then
          insert into public.billing_schedule_repairs(grant_id, old_starts_at, old_expires_at, new_starts_at, new_expires_at)
            values(entry.id, entry.starts_at, entry.expires_at, starts, starts + (entry.expires_at - entry.starts_at))
            on conflict (grant_id) do nothing;
          update public.billing_grants set starts_at = starts,
            expires_at = starts + (entry.expires_at - entry.starts_at) where id = entry.id;
          entry.expires_at := starts + (entry.expires_at - entry.starts_at);
        end if;
      end if;
      previous_end := greatest(previous_end, entry.expires_at);
    end loop;
  end loop;
end;
$$;

commit;
