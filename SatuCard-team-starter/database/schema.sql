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

-- Anonymous visitors do not write to the database or Storage directly.
-- The server uses a Supabase secret key; it must never be placed in browser code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 2097152, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
