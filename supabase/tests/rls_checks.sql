-- ============================================================================
--  RLS smoke tests for Rabi's Saving Hub
--
--  Run against a staging project (never production) with:
--    psql "$DATABASE_URL" -f supabase/tests/rls_checks.sql
--  or paste into the Supabase SQL editor.
--
--  Every check runs inside a transaction that is rolled back, so the database
--  is left untouched. Simulating a signed-in member is a matter of setting the
--  JWT claims for the transaction — that is exactly what PostgREST does.
-- ============================================================================

begin;

-- 1. Two throwaway accounts: a member and an admin ---------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'rls-member@test.local',
   crypt('secret123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"RLS Member","plan":"daily-6"}'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'rls-admin@test.local',
   crypt('secret123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"RLS Admin","plan":"weekly-50"}')
on conflict (id) do nothing;

update public.profiles set is_admin = true
 where id = '22222222-2222-2222-2222-222222222222';

insert into public.susu_rounds (plan_id, plan_name, round_number, status, cashout_date, momo_number, momo_name, slots, total_slots, member_ids)
values ('daily-6', 'Daily GH6', 1, 'active', now(), '0244000000', 'RLS Member',
  '[{"userId":"11111111-1111-1111-1111-111111111111","userName":"RLS Member","position":1,"paidRounds":[],"selfReported":false,"adminConfirmed":false,"nextToReceive":true,"payoutConfirmed":false}]',
  1, array['11111111-1111-1111-1111-111111111111']);

-- 2. Member view -------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_profiles int;
  v_rounds   int;
  v_reports  int;
begin
  select count(*) into v_profiles from public.profiles;
  select count(*) into v_rounds from public.susu_rounds;
  select count(*) into v_reports from public.payment_reports;

  if v_profiles <> 1 then raise exception 'member sees % profiles (expected 1)', v_profiles; end if;
  if v_rounds <> 1 then raise exception 'member sees % rounds (expected 1)', v_rounds; end if;
  if v_reports <> 0 then raise exception 'member sees % reports (expected 0)', v_reports; end if;
  if public.is_admin() then raise exception 'member is flagged as admin'; end if;

  raise notice 'PASS: member sees only their own profile/round and is not an admin';
end $$;

-- 3. Member cannot escalate --------------------------------------------------
do $$
begin
  begin
    update public.profiles set status = 'approved'
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'member was able to approve themselves';
  exception
    when others then
      raise notice 'PASS: member self-approval blocked (%)', sqlerrm;
  end;

  begin
    update public.profiles set is_admin = true
     where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'member was able to grant themselves admin';
  exception
    when others then
      raise notice 'PASS: member self-promotion blocked (%)', sqlerrm;
  end;
end $$;

-- 4. Member can report a payment, but not write the round --------------------
do $$
declare
  v_round uuid;
  v_report uuid;
begin
  select id into v_round from public.susu_rounds limit 1;
  v_report := public.report_payment(v_round, 6, 'MOMO-RLS');
  if v_report is null then raise exception 'report_payment returned null'; end if;
  raise notice 'PASS: member payment report created through RPC';

  begin
    update public.susu_rounds set momo_number = 'hacked' where id = v_round;
    raise exception 'member was able to write the round document';
  exception
    when insufficient_privilege then
      raise notice 'PASS: direct round writes blocked for members';
  end;
end $$;

-- 5. Admin view --------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_profiles int;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles <> 2 then raise exception 'admin sees % profiles (expected 2)', v_profiles; end if;
  if not public.is_admin() then raise exception 'admin flag not detected'; end if;

  update public.profiles set status = 'approved'
   where id = '11111111-1111-1111-1111-111111111111';
  raise notice 'PASS: admin sees all profiles and can approve members';
end $$;

rollback;
