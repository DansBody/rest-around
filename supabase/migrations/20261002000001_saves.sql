-- Cloud saves (see ONLINE.md). The game may read its own save; every write goes through the Edge Functions
-- (service role), which check the session, the revision and the earnings ceiling first.

create table public.saves (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  data             jsonb       not null,
  rev              integer     not null default 1,
  server_saved_at  timestamptz not null default now(),   -- when the server last accepted this save
  last_seen        timestamptz not null default now(),   -- the last heartbeat: offline time is counted from here
  balance_version  integer     not null,
  active_session   uuid,                                  -- the one device allowed to write; a new login replaces it
  created_at       timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "read own save" on public.saves
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete, truncate on public.saves from anon, authenticated;
revoke all on public.saves from anon;

-- Uploads the earnings ceiling had to cut back (authority.js capCheck). Server-only.
create table public.cap_flags (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  at         timestamptz not null default now(),
  rev        integer     not null,
  rejected   boolean     not null default false,
  flags      text[]      not null,
  claimed    jsonb,
  allowed    jsonb
);

create index cap_flags_user_at on public.cap_flags (user_id, at desc);

alter table public.cap_flags enable row level security;
revoke all on public.cap_flags from anon, authenticated;

-- this project does not hand table rights to the API roles by default: reading needs an explicit grant
grant select on public.saves to authenticated;
-- …and the same goes for the server's own role (the Edge Functions use the secret key)
grant select, insert, update, delete on public.saves to service_role;
grant select, insert, update, delete on public.cap_flags to service_role;
