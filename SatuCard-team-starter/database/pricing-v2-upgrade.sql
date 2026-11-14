-- Idempotent upgrade for SatuCard pricing v2 (1500 / 2990 / 4990 / 9990 / 490 niche10)
-- and 5-seat shared team workspace schema.
begin;

do $$
begin
  if to_regclass('public.billing_orders') is not null then
    alter table public.billing_orders drop constraint if exists billing_orders_plan_id_check;
    alter table public.billing_orders add constraint billing_orders_plan_id_check
      check (plan_id in ('basic', 'plus', 'max', 'max3', 'niche10'));
  end if;
end $$;

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

create table if not exists public.team_workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Команда SatuCard',
  max_seats integer not null default 5 check (max_seats between 1 and 5),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.team_members (
  workspace_id uuid not null references public.team_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, user_id)
);

alter table public.team_workspaces enable row level security;
alter table public.team_members enable row level security;
revoke all on public.team_workspaces, public.team_members from public, anon, authenticated, service_role;

commit;
