-- Repeatable security, performance, and style-constraint migration.
-- Apply in Supabase SQL Editor after review; verified locally with PGlite.
begin;

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke all on function public.handle_new_user() from public, anon, authenticated';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.editable_projects') is not null then
    execute 'drop policy if exists editable_projects_owner on public.editable_projects';
    execute 'drop policy if exists "editable_projects_owner" on public.editable_projects';
    execute 'create policy editable_projects_owner on public.editable_projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.billing_grants') is not null then
    execute 'create index if not exists billing_grants_order_id_idx on public.billing_grants (order_id)';
    execute 'create index if not exists billing_grants_user_id_idx on public.billing_grants (user_id, expires_at desc)';
  end if;
  if to_regclass('public.billing_orders') is not null then
    execute 'create index if not exists billing_orders_confirmed_by_idx on public.billing_orders (confirmed_by)';
    execute 'create index if not exists billing_orders_rejected_by_idx on public.billing_orders (rejected_by)';
  end if;
  if to_regclass('public.paid_ai_reservations') is not null then
    execute 'create index if not exists paid_ai_reservations_grant_id_idx on public.paid_ai_reservations (grant_id)';
    execute 'create index if not exists paid_ai_reservations_user_id_idx on public.paid_ai_reservations (user_id, usage_day)';
  end if;
end
$$;

alter table public.cards
  drop constraint if exists cards_style_check,
  drop constraint if exists cards_format_check,
  add constraint cards_style_check check (
    style in (
      'studio', 'accent', 'minimal', 'noir', 'neon', 'editorial', 'bloom', 'bold',
      'showcase', 'blueprint', 'matcha', 'pop', 'graphite', 'cloud'
    )
  ),
  add constraint cards_format_check check (
    format in ('portrait', 'portrait34', 'square', 'story')
  );

commit;
