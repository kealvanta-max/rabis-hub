-- ============================================================================
--  Rabi's Saving Hub — initial Supabase schema
--  Run with: supabase db push   (or paste into the Supabase SQL editor)
--
--  Tables: profiles, susu_rounds, payment_reports, testimonials, announcements,
--          app_settings.
--  Security: row level security on every table, admins gated by
--          profiles.is_admin, members can only touch their own rows.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  name                  text        not null default '',
  email                 text        not null default '',
  phone                 text        not null default '',
  location              text        not null default '',
  plan                  text        not null default '',
  plans                 text[]      not null default '{}',
  gps_lat               double precision not null default 0,
  gps_lng               double precision not null default 0,
  gps_address           text        not null default '',
  ghana_card_number     text        not null default '',
  ghana_card_valid      boolean     not null default false,
  ghana_card_front      text        not null default '',
  ghana_card_back       text        not null default '',
  ghana_card_ocr_result text        not null default '',
  passport_photo        text        not null default '',
  face_scan_video       text        not null default '',
  status                text        not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  whatsapp_link         text        not null default '',
  is_admin              boolean     not null default false,
  terms_accepted        boolean     not null default false,
  terms_accepted_at     timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

-- Susu rounds keep their slots as JSONB: a round is a small, always-read-together
-- document that admins mutate atomically (advance round, confirm payout).
create table if not exists public.susu_rounds (
  id            uuid primary key default gen_random_uuid(),
  plan_id       text        not null default '',
  plan_name     text        not null default '',
  round_number  integer     not null default 1,
  status        text        not null default 'active'
                  check (status in ('active', 'completed')),
  cashout_date  timestamptz not null default now(),
  momo_number   text        not null default '',
  momo_name     text        not null default '',
  slots         jsonb       not null default '[]'::jsonb,
  total_slots   integer     not null default 0,
  member_ids    text[]      not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists susu_rounds_status_idx on public.susu_rounds (status);
create index if not exists susu_rounds_member_ids_idx on public.susu_rounds using gin (member_ids);

create table if not exists public.payment_reports (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid references public.susu_rounds (id) on delete cascade,
  user_id       uuid references public.profiles (id) on delete cascade,
  user_name     text        not null default '',
  amount        numeric     not null default 0,
  momo_ref      text        not null default '',
  round_number  integer     not null default 1,
  reported_at   timestamptz not null default now(),
  confirmed     boolean     not null default false,
  confirmed_at  timestamptz,
  confirmed_by  uuid
);

create index if not exists payment_reports_confirmed_idx on public.payment_reports (confirmed);
create index if not exists payment_reports_user_idx on public.payment_reports (user_id);
create index if not exists payment_reports_round_idx on public.payment_reports (round_id);

create table if not exists public.testimonials (
  id          uuid primary key default gen_random_uuid(),
  user_id     text        not null default '',
  user_name   text        not null default '',
  user_photo  text        not null default '',
  plan_name   text        not null default '',
  rating      integer     not null default 5 check (rating between 1 and 5),
  review      text        not null default '',
  status      text        not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  is_static   boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists testimonials_status_idx on public.testimonials (status);

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null default '',
  message     text        not null default '',
  plan_id     text,
  created_at  timestamptz not null default now()
);

create index if not exists announcements_created_at_idx on public.announcements (created_at desc);

-- Small key/value store for admin settings (WhatsApp links, custom plans).
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Every signup creates its profile row from the auth metadata, so a failed
-- client-side write can never leave an account without a profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := coalesce(new.raw_user_meta_data ->> 'plan', '');
begin
  insert into public.profiles (id, name, email, phone, plan, plans)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    v_plan,
    case when v_plan = '' then '{}'::text[] else array[v_plan] end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A member must never be able to approve themselves or grant admin rights.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role / SQL console writes.
  if auth.uid() is not null and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'Only admins can change admin rights';
    end if;
    if new.status is distinct from old.status then
      raise exception 'Only admins can change a member status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns_trg on public.profiles;
create trigger protect_profile_columns_trg
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Members report a payment; the report and the slot flag are written in one
-- transaction so the dashboard can never show a half-applied state.
create or replace function public.report_payment(
  p_round_id uuid,
  p_amount numeric,
  p_momo_ref text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_round   public.susu_rounds;
  v_name    text;
  v_slots   jsonb;
  v_report  uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to report a payment.';
  end if;

  select * into v_round from public.susu_rounds where id = p_round_id;
  if not found then
    raise exception 'This Susu round no longer exists. Please refresh the page.';
  end if;

  if not (v_uid::text = any (v_round.member_ids)) then
    raise exception 'You are not a member of this Susu round.';
  end if;

  select name into v_name from public.profiles where id = v_uid;

  insert into public.payment_reports (round_id, user_id, user_name, amount, momo_ref, round_number)
  values (p_round_id, v_uid, coalesce(v_name, 'Member'), coalesce(p_amount, 0), coalesce(p_momo_ref, ''), coalesce(v_round.round_number, 1))
  returning id into v_report;

  select jsonb_agg(
           case when slot ->> 'userId' = v_uid::text
                then jsonb_set(slot, '{selfReported}', 'true'::jsonb)
                else slot end
           order by ord
         )
    into v_slots
    from jsonb_array_elements(coalesce(v_round.slots, '[]'::jsonb)) with ordinality as t (slot, ord);

  update public.susu_rounds
     set slots = coalesce(v_slots, v_round.slots)
   where id = p_round_id;

  return v_report;
end;
$$;

-- Append a plan to the caller's plan list (used by "add plan" on the dashboard).
create or replace function public.append_my_plan(p_plan text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set plans = case when p_plan = any (plans) then plans else array_append(plans, p_plan) end
   where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.susu_rounds     enable row level security;
alter table public.payment_reports enable row level security;
alter table public.testimonials    enable row level security;
alter table public.announcements   enable row level security;
alter table public.app_settings    enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- susu_rounds ---------------------------------------------------------------
drop policy if exists rounds_select on public.susu_rounds;
create policy rounds_select on public.susu_rounds
  for select to authenticated
  using (public.is_admin() or auth.uid()::text = any (member_ids));

drop policy if exists rounds_write on public.susu_rounds;
create policy rounds_write on public.susu_rounds
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- payment_reports -----------------------------------------------------------
drop policy if exists reports_select on public.payment_reports;
create policy reports_select on public.payment_reports
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists reports_insert on public.payment_reports;
create policy reports_insert on public.payment_reports
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists reports_update on public.payment_reports;
create policy reports_update on public.payment_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- testimonials --------------------------------------------------------------
drop policy if exists testimonials_select on public.testimonials;
create policy testimonials_select on public.testimonials
  for select to anon, authenticated
  using (status = 'approved' or public.is_admin() or user_id = auth.uid()::text);

drop policy if exists testimonials_insert on public.testimonials;
create policy testimonials_insert on public.testimonials
  for insert to authenticated
  with check (user_id = auth.uid()::text or public.is_admin());

drop policy if exists testimonials_admin_write on public.testimonials;
create policy testimonials_admin_write on public.testimonials
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists testimonials_admin_delete on public.testimonials;
create policy testimonials_admin_delete on public.testimonials
  for delete to authenticated
  using (public.is_admin());

-- announcements -------------------------------------------------------------
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (true);

drop policy if exists announcements_admin_write on public.announcements;
create policy announcements_admin_write on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- app_settings --------------------------------------------------------------
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists settings_admin_write on public.app_settings;
create policy settings_admin_write on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Grants (RLS still applies on top of these)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.testimonials to anon;
grant execute on function public.report_payment(uuid, numeric, text) to authenticated;
grant execute on function public.append_my_plan(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime (live profile updates on the dashboard)
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Seed settings
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('waLinks', '{}'::jsonb), ('customPlans', '{"plans": []}'::jsonb)
on conflict (key) do nothing;
