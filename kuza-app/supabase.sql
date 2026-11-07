-- Run this once in Supabase: SQL Editor > New query > paste > Run
create table if not exists kuza_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists kuza_files (
  name text primary key,
  data text not null
);

-- Lock both tables: row level security on, and no policies, so the public (anon) key sees nothing.
alter table kuza_state enable row level security;
alter table kuza_files enable row level security;

-- Let ONLY your server's secret key use them. This line is required when
-- "Automatically expose new tables" is switched off (which we recommend).
grant select, insert, update, delete on table kuza_state to service_role;
grant select, insert, update, delete on table kuza_files to service_role;
