-- Apply before the API update. The journal survives lost HTTP responses.
begin;
create table if not exists public.card_publication_uploads (
  image_path text primary key check (image_path ~ '^[a-f0-9-]{36}(-[a-f0-9-]{36})?\.jpg$'),
  card_id uuid not null,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists card_publication_uploads_created_idx on public.card_publication_uploads(created_at);
alter table public.card_publication_uploads enable row level security;
revoke all on public.card_publication_uploads from public, anon, authenticated;
grant select, insert, delete on public.card_publication_uploads to service_role;
commit;
