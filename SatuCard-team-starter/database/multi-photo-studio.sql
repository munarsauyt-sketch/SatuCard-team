-- Add the 900 × 1200 portrait format. Run manually after existing migrations.
-- Existing cards, ownership policies, and editable project payloads are unchanged.
begin;
alter table public.cards
  drop constraint if exists cards_format_check,
  add constraint cards_format_check check (format in ('portrait', 'portrait34', 'square', 'story'));
-- Run after editable-projects.sql. Retain legacy v1 projects while accepting v2.
alter table public.editable_projects
  drop constraint if exists editable_projects_payload_check,
  add constraint editable_projects_payload_check check (
    jsonb_typeof(payload) = 'object' and
    payload @> '{"app":"SatuCard"}'::jsonb and
    jsonb_typeof(payload->'settings') = 'object' and
    payload ?& array['app', 'schemaVersion', 'settings', 'logo'] and
    jsonb_typeof(payload->'logo') in ('string', 'null') and
    (
      (payload @> '{"schemaVersion":1}'::jsonb and payload ? 'photo' and
       jsonb_typeof(payload->'photo') in ('string', 'null')) or
      (payload @> '{"schemaVersion":2}'::jsonb and
       payload ?& array['photos', 'views', 'activeViewId'] and not (payload ? 'photo') and
       jsonb_typeof(payload->'photos') = 'array' and
       jsonb_typeof(payload->'views') = 'array' and
       jsonb_typeof(payload->'activeViewId') = 'string')
    ) and octet_length(payload::text) <= 3565536
  );
commit;
