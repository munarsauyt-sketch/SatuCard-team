-- Apply once before enabling publication details and project thumbnails.
-- Existing cards and project payloads remain readable.
begin;
alter table public.cards
  add column if not exists show_price boolean not null default true,
  add column if not exists show_brand boolean not null default true,
  add column if not exists contact_url text not null default '';
alter table public.cards
  alter column price_kzt drop not null;
alter table public.cards drop constraint if exists cards_contact_url_check;
alter table public.cards add constraint cards_contact_url_check
  check (contact_url = '' or (length(contact_url) <= 2000 and contact_url ~ '^https://'));
alter table public.editable_projects
  add column if not exists thumbnail text,
  add column if not exists archived boolean not null default false;
alter table public.editable_projects drop constraint if exists editable_projects_thumbnail_check;
alter table public.editable_projects add constraint editable_projects_thumbnail_check
  check (thumbnail is null or (length(thumbnail) <= 70000 and thumbnail ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'));
notify pgrst, 'reload schema';
grant select, insert, update, delete on public.cards to service_role;
grant select, insert, update, delete on public.editable_projects to service_role;
commit;
