-- Apply after paid-access.sql and annual-billing.sql, after review.
-- Separates provider expense from usable results charged to the customer.
-- No provider keys, prompts, photos or generated text are stored.
begin;

alter table public.paid_ai_reservations
  add column if not exists customer_tokens bigint
  check (customer_tokens is null or customer_tokens between 0 and token_cap);

-- Preserve charges from older versions without rewriting historical balances.
update public.paid_ai_reservations set customer_tokens = total_tokens
  where outcome <> 'pending' and customer_tokens is null;

create or replace function public.get_paid_ai_accounting_version()
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object('settlementVersion', 2);
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
  -- A crashed caller releases the customer's allowance. Its conservative
  -- provider cost stays reserved until service-side reconciliation.
  for stale in select * from public.paid_ai_reservations
    where user_id = p_user_id and outcome = 'pending' and created_at < at_time - interval '2 minutes'
    order by created_at for update
  loop
    update public.billing_grants set tokens_reserved = tokens_reserved - stale.token_cap
      where id = stale.grant_id;
    update public.paid_ai_reservations set outcome = 'uncertain', total_tokens = token_cap, customer_tokens = 0, settled_at = at_time
      where request_id = stale.request_id;
  end loop;
  if exists(select 1 from public.paid_ai_reservations where request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'code', 'duplicate_request');
  end if;
  -- Refunded technical failures still cost the provider. Bound repeated failed
  -- attempts independently from the customer's remaining token allowance.
  if (select count(*) from public.paid_ai_reservations
      where user_id = p_user_id and created_at > at_time - interval '1 hour'
        and outcome in ('invalid', 'uncertain', 'failed_reconciled')) >= 10 then
    return jsonb_build_object('allowed', false, 'code', 'ai_failure_limit');
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
  return jsonb_build_object('allowed', true, 'reservation_id', p_request_id, 'settlementVersion', 2);
end;
$$;

create or replace function public.settle_paid_ai_attempt(p_request_id uuid, p_total_tokens bigint, p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer uuid;
  access_id uuid;
  saved public.paid_ai_reservations%rowtype;
  actual bigint;
  customer_charge bigint;
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
  if saved.outcome <> 'pending' then
    return jsonb_build_object('settled', true, 'customerTokens', saved.customer_tokens);
  end if;
  actual := coalesce(p_total_tokens, saved.token_cap);
  customer_charge := case when p_total_tokens is not null and p_outcome in ('completed', 'success') then actual else 0 end;
  actual_units := ceil(actual::numeric * saved.multiplier_hundredths / 100)::bigint;
  refund := saved.provider_cap_units - actual_units;
  update public.paid_ai_daily_usage set units = units - refund
    where usage_day = saved.usage_day and units >= refund;
  if not found then raise exception 'Quota state unavailable'; end if;
  update public.billing_grants set tokens_reserved = tokens_reserved - saved.token_cap,
    tokens_used = tokens_used + customer_charge where id = saved.grant_id;
  update public.paid_ai_reservations set total_tokens = actual, customer_tokens = customer_charge,
    outcome = case when p_total_tokens is null then 'uncertain' else p_outcome end,
    settled_at = clock_timestamp() where request_id = p_request_id;
  return jsonb_build_object('settled', true, 'customerTokens', customer_charge);
end;
$$;

-- Only the server/support may reconcile an uncertain expense after verifying
-- provider usage. This never creates a new charge on the customer's allowance.
create or replace function public.reconcile_paid_ai_attempt(p_request_id uuid, p_provider_tokens bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  customer uuid;
  access_id uuid;
  saved public.paid_ai_reservations%rowtype;
  actual_units bigint;
  refund bigint;
begin
  if p_request_id is null or p_provider_tokens is null or p_provider_tokens < 0 then
    raise exception 'Invalid reconciliation' using errcode = '22023';
  end if;
  select user_id, grant_id into customer, access_id from public.paid_ai_reservations where request_id = p_request_id;
  if not found then return jsonb_build_object('reconciled', false); end if;
  perform 1 from public.billing_accounts where user_id = customer for update;
  perform 1 from public.paid_ai_limits where singleton = true for update;
  if not found then raise exception 'Quota state unavailable'; end if;
  perform 1 from public.billing_grants where id = access_id for update;
  select * into strict saved from public.paid_ai_reservations where request_id = p_request_id for update;
  if saved.outcome = 'failed_reconciled' and saved.total_tokens = p_provider_tokens then
    return jsonb_build_object('reconciled', true);
  end if;
  if saved.outcome <> 'uncertain' or saved.customer_tokens <> 0 or p_provider_tokens > saved.token_cap then
    raise exception 'Reservation cannot be reconciled' using errcode = '22023';
  end if;
  actual_units := ceil(p_provider_tokens::numeric * saved.multiplier_hundredths / 100)::bigint;
  refund := ceil(saved.total_tokens::numeric * saved.multiplier_hundredths / 100)::bigint - actual_units;
  update public.paid_ai_daily_usage set units = units - refund
    where usage_day = saved.usage_day and units >= refund;
  if not found then raise exception 'Quota state unavailable'; end if;
  update public.paid_ai_reservations
    set total_tokens = p_provider_tokens, outcome = 'failed_reconciled', settled_at = clock_timestamp()
    where request_id = p_request_id;
  return jsonb_build_object('reconciled', true);
end;
$$;

revoke all on function public.reserve_paid_ai_attempt(uuid,uuid,text,bigint),
  public.settle_paid_ai_attempt(uuid,bigint,text), public.reconcile_paid_ai_attempt(uuid,bigint),
  public.get_paid_ai_accounting_version()
  from public, anon, authenticated;
grant execute on function public.reserve_paid_ai_attempt(uuid,uuid,text,bigint),
  public.settle_paid_ai_attempt(uuid,bigint,text), public.reconcile_paid_ai_attempt(uuid,bigint),
  public.get_paid_ai_accounting_version()
  to service_role;
commit;
