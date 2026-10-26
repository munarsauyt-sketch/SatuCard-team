-- Apply once before deploying the verified-registration release. Safe to re-run.
begin;
alter table public.profiles add column if not exists first_name text not null default '';
alter table public.profiles add column if not exists last_name text not null default '';
alter table public.profiles add column if not exists profile_completed_at timestamptz;
-- Existing classroom accounts require fresh mailbox proof in EACH session.
-- Adding the column with TRUE backfills existing rows; only future rows default FALSE.
alter table public.profiles add column if not exists mail_proof_required boolean not null default true;
alter table public.profiles alter column mail_proof_required set default false;

create or replace function public.satucard_verified_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = (select auth.uid()) and u.email_confirmed_at is not null
      and (not p.mail_proof_required or exists (
        select 1 from jsonb_array_elements(coalesce((select auth.jwt())->'amr', '[]'::jsonb)) a
        where a->>'method' in ('oauth', 'otp', 'magiclink', 'recovery')
      ))
  );
$$;
revoke all on function public.satucard_verified_session() from public, anon;
grant execute on function public.satucard_verified_session() to authenticated;

-- Restrictive policies also apply to any other permissive policy on these tables.
drop policy if exists "Require mailbox proof for profiles" on public.profiles;
create policy "Require mailbox proof for profiles" on public.profiles as restrictive
  for select to authenticated using ((select public.satucard_verified_session()));
drop policy if exists "Require mailbox proof for cards" on public.cards;
create policy "Require mailbox proof for cards" on public.cards as restrictive
  for select to authenticated using ((select public.satucard_verified_session()));

-- Profiles can only be changed by the verified server endpoint. A caller must not
-- clear mail_proof_required or mark onboarding complete through PostgREST.
revoke insert, update, delete on public.profiles from anon, authenticated;
commit;
