-- Run once in the Supabase SQL Editor.
create table if not exists public.cards (
  id uuid primary key,
  title varchar(60) not null check (length(trim(title)) > 0),
  price_kzt numeric(11, 2) not null check (price_kzt >= 0 and price_kzt <= 999999999.99),
  old_price_kzt numeric(11, 2) check (old_price_kzt is null or old_price_kzt > price_kzt),
  style text not null check (style in ('studio', 'accent', 'minimal')),
  format text not null check (format in ('portrait', 'square')),
  brand_name varchar(28) not null default '',
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists cards_created_at_idx on public.cards (created_at desc);
alter table public.cards enable row level security;

-- One profile is created automatically when Supabase Auth registers a user.
-- Password hashes and sessions stay in the managed auth schema.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name varchar(80) not null check (length(trim(name)) > 0),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 80),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Existing published demo cards remain available through the public card API.
alter table public.cards
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists cards_user_created_idx on public.cards (user_id, created_at desc);
grant select on public.cards to authenticated;
drop policy if exists "Users can read their own cards" on public.cards;
create policy "Users can read their own cards"
  on public.cards for select to authenticated
  using ((select auth.uid()) = user_id);

-- Anonymous visitors do not write to the database or Storage directly.
-- The server uses a Supabase secret key; it must never be placed in browser code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
