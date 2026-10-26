-- Configure this function as the Supabase Custom Access Token hook after running.
-- Legacy passwords must not mint Auth tokens, not just fail an application check.
create or replace function public.satucard_token_guard(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  legacy boolean;
  confirmed boolean;
  methods jsonb;
begin
  select p.mail_proof_required, u.email_confirmed_at is not null
    into legacy, confirmed
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = (event->>'user_id')::uuid;
  if confirmed is distinct from true then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'EMAIL_CONFIRMATION_REQUIRED'));
  end if;
  methods := case when jsonb_typeof(event->'claims'->'amr') = 'array' then event->'claims'->'amr' else '[]'::jsonb end;
  if legacy and coalesce(event->>'authentication_method', '') not in ('oauth', 'otp', 'magiclink', 'recovery', 'email/signup')
     and not exists (select 1 from jsonb_array_elements(methods) m where m->>'method' in ('oauth', 'otp', 'magiclink', 'recovery')) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'MAILBOX_PROOF_REQUIRED'));
  end if;
  return jsonb_build_object('claims', event->'claims');
end;
$$;
revoke all on function public.satucard_token_guard(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.satucard_token_guard(jsonb) to supabase_auth_admin;
