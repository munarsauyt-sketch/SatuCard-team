-- Upgrade only the allowed template/format values in an existing SatuCard database.
-- Original column checks are named cards_style_check and cards_format_check.
-- Existing rows, ownership, RLS policies and Storage configuration are preserved.
-- Re-running the migration is safe; the change is atomic.
begin;

alter table public.cards
  drop constraint if exists cards_style_check,
  drop constraint if exists cards_format_check,
  add constraint cards_style_check check (style in ('studio', 'accent', 'minimal', 'noir', 'neon', 'editorial', 'bloom', 'bold')),
  add constraint cards_format_check check (format in ('portrait', 'square', 'story'));

commit;
