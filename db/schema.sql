-- Kashmir Trip Planner — V1 schema.
-- The audit trail is: trip → lead → quote → booking → payment → completed trip → review.
-- Every statement is idempotent so the file can be re-run safely.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,
  email text,
  role text not null default 'tourist'
    check (role in ('tourist', 'agency_admin', 'agency_staff', 'platform_admin')),
  password_hash text,
  created_at timestamptz not null default now()
);

-- Bumped on password change; sessions carrying an older version are rejected.
alter table users add column if not exists session_version integer not null default 1;
create unique index if not exists users_admin_email on users (lower(email)) where role = 'platform_admin';

create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  phone text not null,
  email text,
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING', 'VERIFIED', 'SUSPENDED')),
  -- Only what the platform has actually checked, e.g. 'J&K Tourism registration'.
  verified_items text[] not null default '{}',
  -- Destination ids the agency operates in (see src/lib/destinations.ts).
  coverage text[] not null default '{}',
  min_budget integer not null default 0,
  max_budget integer,
  -- FREE: early partners. LEAD_FEE: each accepted lead uses one prepaid credit.
  commission_model text not null default 'FREE'
    check (commission_model in ('FREE', 'LEAD_FEE', 'SUBSCRIPTION', 'COMMISSION')),
  commission_rate numeric(5, 2) not null default 0,
  lead_credits integer not null default 0 check (lead_credits >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists agency_users (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'agency_admin' check (role in ('agency_admin', 'agency_staff')),
  unique (agency_id, user_id)
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  start_date date not null,
  end_date date not null,
  travellers integer not null check (travellers between 1 and 50),
  budget_min integer not null default 0,
  budget_max integer,
  interests text[] not null default '{}',
  destinations text[] not null default '{}',
  hotel_category text not null default 'standard',
  activity_level text not null default 'moderate',
  with_kids boolean not null default false,
  excluded text[] not null default '{}',
  notes text not null default '',
  ai_itinerary jsonb,
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'QUOTES_REQUESTED', 'BOOKED', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists trip_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  status text not null default 'NEW'
    check (status in ('NEW', 'ACCEPTED', 'QUOTE_SENT', 'CUSTOMER_VIEWED', 'SELECTED', 'LOST', 'EXPIRED', 'DECLINED')),
  -- Set when the customer changed the trip and asked this agency to re-price it.
  revision_note text,
  credit_charged boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (trip_id, agency_id)
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  amount integer not null check (amount > 0),
  -- { lineItems: [{category, label, amount}], markup, inclusions, exclusions, notes }
  details jsonb not null,
  customer_summary text not null default '',
  valid_until date not null,
  status text not null default 'SENT'
    check (status in ('SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED')),
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  agency_id uuid not null references agencies(id),
  quote_id uuid not null unique references quotes(id),
  total_amount integer not null,
  deposit_amount integer not null,
  status text not null default 'PENDING_DEPOSIT'
    check (status in ('PENDING_DEPOSIT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

-- A trip has at most one live booking.
create unique index if not exists bookings_one_live_per_trip
  on bookings (trip_id) where status <> 'CANCELLED';

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  amount integer not null check (amount > 0),
  payment_type text not null check (payment_type in ('DEPOSIT', 'BALANCE', 'REFUND')),
  payment_status text not null default 'PENDING'
    check (payment_status in ('PENDING', 'VERIFIED', 'FAILED')),
  payment_provider_reference text,
  recorded_by text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create unique index if not exists payments_provider_ref
  on payments (payment_provider_reference) where payment_provider_reference is not null;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id),
  user_id uuid references users(id),
  agency_id uuid not null references agencies(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  verified_trip boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id),
  booking_id uuid references bookings(id),
  message text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_at timestamptz not null default now()
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  delta integer not null,
  reason text not null,
  lead_id uuid references leads(id),
  created_at timestamptz not null default now()
);

-- Outbox for WhatsApp/SMS/email. V1 sends these by hand from the admin screen;
-- a provider integration only needs to drain QUEUED rows.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'whatsapp',
  recipient text not null,
  message text not null,
  link text,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'SENT', 'FAILED')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Append-only log of every state change, for disputes and analytics.
create table if not exists events (
  id bigserial primary key,
  entity_type text not null,
  entity_id uuid not null,
  event text not null,
  actor text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists events_entity on events (entity_type, entity_id);
create index if not exists leads_agency_status on leads (agency_id, status);
create index if not exists quotes_lead on quotes (lead_id);

-- Fixed-window counters for rate limiting public endpoints and logins.
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- Anonymous funnel steps that don't otherwise leave a row (visits, planner starts, quote views).
create table if not exists analytics_events (
  id bigserial primary key,
  name text not null,
  visitor_id text,
  trip_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_name_time on analytics_events (name, created_at);

-- Row Level Security. The app talks to Postgres from the server only, as the table owner,
-- which bypasses RLS. Enabling RLS with no policies means Supabase's public REST/GraphQL API
-- (anon and authenticated keys) can read or write nothing.
do $$
declare t text;
begin
  foreach t in array array[
    'users', 'agencies', 'agency_users', 'trips', 'trip_messages', 'leads', 'quotes', 'bookings',
    'payments', 'reviews', 'issues', 'credit_transactions', 'notifications', 'events', 'rate_limits',
    'analytics_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table %I from authenticated', t);
    end if;
  end loop;
end $$;
