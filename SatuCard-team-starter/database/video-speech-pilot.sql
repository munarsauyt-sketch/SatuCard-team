-- Optional speech pilot; not applied or enabled by the video draft.
begin;
create table if not exists public.video_speech_allowance (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  requests_left integer not null default 0 check (requests_left between 0 and 20)
);
alter table public.video_speech_allowance enable row level security;
revoke all on public.video_speech_allowance from public, anon, authenticated;
create or replace function public.reserve_video_speech(p_owner uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.video_speech_allowance set requests_left=requests_left-1
  where owner_id=p_owner and requests_left>0;
  return found;
end; $$;
revoke all on function public.reserve_video_speech(uuid) from public, anon, authenticated;
grant execute on function public.reserve_video_speech(uuid) to service_role;
commit;
-- An administrator must explicitly grant a pilot allowance after budget approval.
-- No allowance row or credit is created by this migration.
