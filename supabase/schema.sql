-- =============================================================================
-- Dubois Automotive Rescue — Supabase schema
-- Run once in Supabase SQL Editor (or `supabase db push` as a migration).
-- Money: integer cents. Tax rates: integer parts-per-million (9.75% = 97500).
-- Access model: RLS ON everywhere. Public site never touches tables directly;
-- server routes use the service-role key. Admin UI uses the logged-in user's
-- JWT and passes RLS via public.is_admin().
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.service_mode      as enum ('mobile','shop');
  create type public.booking_status    as enum ('new','estimate_sent','approved','in_progress','completed','paid','cancelled');
  create type public.invoice_status    as enum ('draft','sent','approved','paid','void');
  create type public.line_type         as enum ('part','labor','fee','supply','discount');
  create type public.dvi_rating        as enum ('green','yellow','red');
  create type public.deposit_status    as enum ('none','pending','paid','refunded');
  create type public.membership_plan   as enum ('daily_driver','family','fleet');
  create type public.billing_interval  as enum ('month','year');
  create type public.membership_status as enum ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused');
  create type public.discount_type     as enum ('fixed','percent','freebie');
  create type public.promo_scope       as enum ('any','mobile','shop');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
-- EXACT spelling: "dubios" is intentional.
insert into public.admins (email) values ('kyledubios2412@gmail.com') on conflict do nothing;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- business_settings (single row)
create table if not exists public.business_settings (
  id                         smallint primary key default 1 check (id = 1),
  diagnostic_fee_cents       integer not null default 8900  check (diagnostic_fee_cents >= 0),
  mobile_callout_fee_cents   integer not null default 4500  check (mobile_callout_fee_cents >= 0),
  shop_labor_rate_cents      integer not null default 11000 check (shop_labor_rate_cents >= 0),
  booking_deposit_cents      integer not null default 8900  check (booking_deposit_cents >= 0),
  mobile_capacity_per_window integer not null default 1     check (mobile_capacity_per_window between 0 and 20),
  shop_capacity_per_window   integer not null default 2     check (shop_capacity_per_window between 0 and 20),
  updated_at                 timestamptz not null default now()
);
insert into public.business_settings (id) values (1) on conflict do nothing;
create or replace trigger trg_business_settings_updated before update on public.business_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- tax_presets
create table if not exists public.tax_presets (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  state         text not null check (state in ('AL','GA')),
  rate_ppm      integer not null check (rate_ppm between 0 and 200000), -- 9.75% = 97500
  parts_taxable boolean not null default true,
  labor_taxable boolean not null default false,
  fees_taxable  boolean not null default false,
  is_default    boolean not null default false,
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists tax_presets_one_default on public.tax_presets (is_default) where is_default;
create or replace trigger trg_tax_presets_updated before update on public.tax_presets
  for each row execute function public.set_updated_at();

-- Defaults sourced Nov 2026 from public rate tables. CONFIRM WITH YOUR CPA before go-live,
-- including whether separately-stated repair labor / fees are taxable in each state.
insert into public.tax_presets (slug, name, state, rate_ppm, parts_taxable, labor_taxable, fees_taxable, is_default, notes) values
  ('al-phenix-city',  'Alabama — Phenix City (4% state + 1% Russell Co. + 4.75% city)', 'AL', 97500, true, false, false, true,
   'Shop location default. Verify with AL DOR / City of Phenix City.'),
  ('al-russell-unincorporated', 'Alabama — Russell Co. unincorporated (Seale / Fort Mitchell)', 'AL', 88750, true, false, false, false,
   'Mobile jobs outside city limits. Verify by address.'),
  ('ga-columbus',     'Georgia — Columbus / Muscogee Co. (4% state + 4% county + 1% TSPLOST)', 'GA', 90000, true, false, false, false,
   'Mobile jobs in Columbus / Fort Benning area. Verify with GA DOR.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- customers
create table if not exists public.customers (
  id                 uuid primary key default gen_random_uuid(),
  full_name          text not null check (char_length(full_name) between 1 and 120),
  email              text check (email is null or email = lower(email)),
  phone              text,
  stripe_customer_id text unique,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists customers_email_unique on public.customers (email) where email is not null;
create or replace trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- vehicles
create table if not exists public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  year        integer check (year between 1950 and 2100),
  make        text not null,
  model       text not null,
  engine      text,
  vin         text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  mileage     integer check (mileage is null or mileage between 0 and 2000000),
  created_at  timestamptz not null default now()
);
create index if not exists vehicles_customer_idx on public.vehicles (customer_id);
create unique index if not exists vehicles_customer_vin_unique on public.vehicles (customer_id, vin) where vin is not null;

-- ---------------------------------------------------------------- promos
create table if not exists public.promos (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,24}$'),
  title             text not null,
  description       text,
  discount_type     public.discount_type not null,
  amount_cents      integer not null default 0 check (amount_cents >= 0),
  percent_off       integer not null default 0 check (percent_off between 0 and 100),
  scope             public.promo_scope not null default 'any',
  service_id        text,
  first_time_only   boolean not null default false,
  featured          boolean not null default true,
  active            boolean not null default true,
  starts_at         timestamptz,
  ends_at           timestamptz,
  max_redemptions   integer check (max_redemptions is null or max_redemptions > 0),
  redemptions       integer not null default 0,
  sort              integer not null default 100,
  created_at        timestamptz not null default now()
);

insert into public.promos (code, title, description, discount_type, amount_cents, scope, service_id, first_time_only, featured, sort) values
  ('FIRSTMOBILE25', '$25 Off First Mobile Repair', 'New customers: $25 off any mobile repair over $150.', 'fixed', 2500, 'mobile', null, true, true, 10),
  ('BATTERYCHECK',  'Free Battery & Alternator Check w/ Oil Change', 'Load-tested battery + charging system check with any oil service.', 'freebie', 0, 'any', 'oil-change', false, true, 20),
  ('DIAGWAIVED',    'Diagnostic Fee Waived w/ Repair', 'Approve the repair and the $89 diagnostic fee comes off your bill.', 'freebie', 0, 'any', null, false, true, 30),
  ('TRUCK25',       '$25 Off — You Spotted Our Truck', 'Scanned the tailgate QR? $25 off any repair over $150.', 'fixed', 2500, 'any', null, false, false, 40)
on conflict (code) do nothing;

create or replace function public.increment_promo_redemption(p_code text) returns void
language sql security definer set search_path = '' as $$
  update public.promos set redemptions = redemptions + 1 where code = upper(p_code);
$$;
revoke all on function public.increment_promo_redemption(text) from public, anon, authenticated;
grant execute on function public.increment_promo_redemption(text) to service_role;

-- ---------------------------------------------------------------- bookings
create table if not exists public.bookings (
  id                         uuid primary key default gen_random_uuid(),
  ref                        text not null unique,
  mode                       public.service_mode not null,
  status                     public.booking_status not null default 'new',
  customer_id                uuid not null references public.customers(id) on delete restrict,
  vehicle_id                 uuid references public.vehicles(id) on delete set null,
  service_ids                text[] not null default '{}',
  symptoms                   text,
  media_paths                text[] not null default '{}',
  service_street             text,
  service_city               text,
  service_state              text,
  service_zip                text,
  parking_notes              text,
  after_hours_key_drop       boolean not null default false,
  scheduled_date             date not null,
  window_id                  text not null,
  window_label               text not null,
  scheduled_start            timestamptz not null,
  scheduled_end              timestamptz not null,
  promo_code                 text,
  payment_choice             text not null check (payment_choice in ('deposit','estimate')),
  deposit_status             public.deposit_status not null default 'none',
  deposit_cents              integer not null default 0,
  deposit_paid_cents         integer not null default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  utm_source                 text,
  utm_medium                 text,
  utm_campaign               text,
  admin_notes                text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint mobile_requires_address check (mode = 'shop' or (service_street is not null and service_zip is not null))
);
create index if not exists bookings_slot_idx on public.bookings (scheduled_date, window_id, mode) where status <> 'cancelled';
create index if not exists bookings_status_idx on public.bookings (status, created_at desc);
create or replace trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- invoices
create sequence if not exists public.invoice_number_seq start 1001;

create table if not exists public.invoices (
  id                         uuid primary key default gen_random_uuid(),
  number                     text unique,
  token                      text not null unique check (char_length(token) >= 24),
  booking_id                 uuid references public.bookings(id) on delete set null,
  customer_id                uuid not null references public.customers(id) on delete restrict,
  vehicle_id                 uuid references public.vehicles(id) on delete set null,
  mode                       public.service_mode not null default 'shop',
  status                     public.invoice_status not null default 'draft',
  tax_preset_id              uuid references public.tax_presets(id) on delete set null,
  tax_name                   text not null default '',
  tax_rate_ppm               integer not null default 0,
  parts_cents                integer not null default 0,
  labor_cents                integer not null default 0,
  fees_cents                 integer not null default 0,
  supplies_cents             integer not null default 0,
  discount_cents             integer not null default 0,
  subtotal_cents             integer not null default 0,
  taxable_cents              integer not null default 0,
  tax_cents                  integer not null default 0,
  total_cents                integer not null default 0,
  deposit_applied_cents      integer not null default 0,
  amount_paid_cents          integer not null default 0,
  odometer                   integer,
  notes                      text,
  warranty_terms             text,
  sent_at                    timestamptz,
  approved_at                timestamptz,
  approved_signature         text,
  approved_ip                text,
  approved_user_agent        text,
  paid_at                    timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  stripe_charge_id           text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index if not exists invoices_status_idx on public.invoices (status, created_at desc);
create index if not exists invoices_booking_idx on public.invoices (booking_id);

create or replace function public.assign_invoice_number() returns trigger
language plpgsql as $$
begin
  if new.number is null then
    new.number := 'INV-' || to_char(now() at time zone 'America/New_York', 'YYYY') || '-'
                  || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  end if;
  return new;
end $$;
create or replace trigger trg_invoices_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();
create or replace trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- invoice_items
create table if not exists public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  sort             integer not null default 0,
  type             public.line_type not null,
  description      text not null check (char_length(description) between 1 and 300),
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null,
  taxable          boolean not null default false,
  line_total_cents integer not null
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id, sort);

-- ---------------------------------------------------------------- inspection_photos (DVI)
create table if not exists public.inspection_photos (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid references public.bookings(id) on delete cascade,
  invoice_id   uuid references public.invoices(id) on delete cascade,
  storage_path text not null,
  rating       public.dvi_rating not null,
  title        text not null,
  caption      text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint dvi_parent check (booking_id is not null or invoice_id is not null)
);
create index if not exists inspection_photos_booking_idx on public.inspection_photos (booking_id);
create index if not exists inspection_photos_invoice_idx on public.inspection_photos (invoice_id);

-- ---------------------------------------------------------------- memberships
create table if not exists public.memberships (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid references public.customers(id) on delete set null,
  plan                    public.membership_plan not null,
  interval                public.billing_interval not null,
  status                  public.membership_status not null default 'incomplete',
  vehicles_allowed        integer not null default 1,
  stripe_customer_id      text,
  stripe_subscription_id  text not null unique,
  stripe_price_id         text,
  unit_amount_cents       integer,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  oil_changes_used        integer not null default 0,
  callouts_waived_used    integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists memberships_status_idx on public.memberships (status);
create or replace trigger trg_memberships_updated before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- stripe_events (webhook idempotency)
create table if not exists public.stripe_events (
  id         text primary key,
  type       text not null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
alter table public.admins            enable row level security;
alter table public.business_settings enable row level security;
alter table public.tax_presets       enable row level security;
alter table public.customers         enable row level security;
alter table public.vehicles          enable row level security;
alter table public.promos            enable row level security;
alter table public.bookings          enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.memberships       enable row level security;
alter table public.stripe_events     enable row level security;

-- Admin: full access on every business table.
do $$
declare t text;
begin
  foreach t in array array['business_settings','tax_presets','customers','vehicles','promos','bookings',
                           'invoices','invoice_items','inspection_photos','memberships'] loop
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists "admin_read_admins" on public.admins;
create policy "admin_read_admins" on public.admins for select to authenticated using (public.is_admin());

-- Public read: live featured promos + non-sensitive rates (used by marketing pages).
drop policy if exists "public_read_live_promos" on public.promos;
create policy "public_read_live_promos" on public.promos for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

drop policy if exists "public_read_rates" on public.business_settings;
create policy "public_read_rates" on public.business_settings for select to anon, authenticated using (true);

-- stripe_events: no policies => service_role only.

-- Explicit grants (RLS still decides row visibility).
grant usage on schema public to anon, authenticated;
grant select on public.promos, public.business_settings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('customer-uploads',  'customer-uploads',  false, 52428800,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']),
  ('inspection-photos', 'inspection-photos', false, 15728640,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Customers upload via server-issued signed upload URLs (no anon policy needed).
drop policy if exists "admin_read_uploads" on storage.objects;
create policy "admin_read_uploads" on storage.objects for select to authenticated
  using (bucket_id in ('customer-uploads','inspection-photos') and public.is_admin());

drop policy if exists "admin_insert_dvi" on storage.objects;
create policy "admin_insert_dvi" on storage.objects for insert to authenticated
  with check (bucket_id = 'inspection-photos' and public.is_admin());

drop policy if exists "admin_update_dvi" on storage.objects;
create policy "admin_update_dvi" on storage.objects for update to authenticated
  using (bucket_id = 'inspection-photos' and public.is_admin());

drop policy if exists "admin_delete_storage" on storage.objects;
create policy "admin_delete_storage" on storage.objects for delete to authenticated
  using (bucket_id in ('customer-uploads','inspection-photos') and public.is_admin());
