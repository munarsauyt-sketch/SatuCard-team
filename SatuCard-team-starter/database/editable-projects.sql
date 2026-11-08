-- Apply manually in Supabase SQL Editor. No Storage bucket or public image URL:
-- original raster data and all editable settings stay in this private table.
begin;
create table if not exists public.editable_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and
    payload @> '{"app":"SatuCard","schemaVersion":1}'::jsonb and
    jsonb_typeof(payload->'settings') = 'object' and
    payload ?& array['app', 'schemaVersion', 'settings', 'photo', 'logo'] and
    jsonb_typeof(payload->'photo') in ('string', 'null') and
    jsonb_typeof(payload->'logo') in ('string', 'null') and
    -- JSONB text adds formatting whitespace. The API caps the entire compact
    -- request at 3,500,000 bytes; allow 64 KiB here for database serialization.
    octet_length(payload::text) <= 3565536
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists editable_projects_owner_updated_idx on public.editable_projects(user_id, updated_at desc);
alter table public.editable_projects enable row level security;
alter table public.editable_projects force row level security;
-- All access goes through /api/projects so account-completion and mailbox proof
-- checks cannot be bypassed by calling PostgREST with an ordinary session token.
revoke all on public.editable_projects from public, anon, authenticated;
grant select, insert, update on public.editable_projects to service_role;
drop policy if exists editable_projects_owner on public.editable_projects;
create policy editable_projects_owner on public.editable_projects for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.guard_editable_project_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'Project identity is immutable';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'Project update requires next version';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.guard_editable_project_version() from public, anon, authenticated;
drop trigger if exists guard_editable_project_version on public.editable_projects;
create trigger guard_editable_project_version before update on public.editable_projects
  for each row execute function public.guard_editable_project_version();
commit;
