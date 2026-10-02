-- Friends, visits and helping (see ONLINE.md "好友與互動"). Like `saves`, none of this is open to the game
-- directly: the `game` Edge Function reads and writes it with the secret key, and the two functions below
-- keep each write in one transaction.

-- ---------------------------------------------------------------- profiles
-- What a friend list shows about a player; refreshed by the server on every save it stores.
create or replace function public.gen_friend_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- no 0/O, 1/I/L
  code text := '';
begin
  for i in 1..8 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end $$;

create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  friend_code text not null unique default public.gen_friend_code(),
  cafe_name   text not null default 'Sunny Café',
  level       integer not null default 1,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- friendships
-- One row per pair, the smaller user id first. `pending` until the other one accepts.
create table public.friendships (
  a            uuid not null references auth.users (id) on delete cascade,
  b            uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  points       integer not null default 0,   -- friendship, shared by both
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (a, b),
  check (a < b)
);
create index friendships_b on public.friendships (b);

-- ---------------------------------------------------------------- help
-- Every helping hand, for the daily limits (day = the server's UTC date).
create table public.help_log (
  id      bigint generated always as identity primary key,
  helper  uuid not null references auth.users (id) on delete cascade,
  target  uuid not null references auth.users (id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  kind    text not null check (kind in ('clean', 'snack', 'gift')),
  amount  integer not null default 1,
  at      timestamptz not null default now()
);
create index help_log_pair_day on public.help_log (helper, target, day);

-- The friend's inbox: merged into their save at their next heartbeat or login.
create table public.deliveries (
  id           bigint generated always as identity primary key,
  to_user      uuid not null references auth.users (id) on delete cascade,
  from_user    uuid references auth.users (id) on delete set null,
  kind         text not null check (kind in ('clean', 'snack', 'gift')),
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);
create index deliveries_pending on public.deliveries (to_user) where delivered_at is null;

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.help_log    enable row level security;
alter table public.deliveries  enable row level security;
revoke all on public.profiles, public.friendships, public.help_log, public.deliveries from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.friendships, public.help_log, public.deliveries to service_role;

-- ---------------------------------------------------------------- writes, one transaction each
-- Store a save: only over revision `p_old_rev` (and, when given, only for session `p_session`), mark the
-- inbox items it now contains as delivered, and refresh the player's profile. Returns the new revision,
-- or null when the save moved on in the meantime (the caller answers 409).
create or replace function public.game_commit(
  p_user uuid, p_old_rev integer, p_session uuid, p_set_session uuid, p_data jsonb, p_balance integer,
  p_delivered bigint[], p_name text, p_level integer
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  new_rev integer;
begin
  update public.saves
     set data = p_data, rev = rev + 1, server_saved_at = now(), last_seen = now(), balance_version = p_balance,
         active_session = coalesce(p_set_session, active_session)
   where user_id = p_user and rev = p_old_rev and (p_session is null or active_session = p_session)
  returning rev into new_rev;
  if new_rev is null then return null; end if;
  if p_delivered is not null and array_length(p_delivered, 1) > 0 then
    update public.deliveries set delivered_at = now()
     where to_user = p_user and id = any (p_delivered) and delivered_at is null;
  end if;
  insert into public.profiles (user_id, cafe_name, level, updated_at)
  values (p_user, left(coalesce(nullif(p_name, ''), 'Sunny Café'), 24), p_level, now())
  on conflict (user_id) do update set cafe_name = excluded.cafe_name, level = excluded.level, updated_at = now();
  return new_rev;
end $$;

-- A helping hand: store the helper's save (already charged for it), log the help, drop it in the friend's
-- inbox and add the friendship. Returns the helper's new revision, or null when their save moved on.
create or replace function public.game_help(
  p_helper uuid, p_old_rev integer, p_session uuid, p_data jsonb, p_target uuid, p_kind text, p_amount integer,
  p_payload jsonb, p_friendship integer
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  new_rev integer;
begin
  update public.saves
     set data = p_data, rev = rev + 1, server_saved_at = now(), last_seen = now()
   where user_id = p_helper and rev = p_old_rev and active_session = p_session
  returning rev into new_rev;
  if new_rev is null then return null; end if;
  insert into public.help_log (helper, target, kind, amount) values (p_helper, p_target, p_kind, p_amount);
  insert into public.deliveries (to_user, from_user, kind, payload) values (p_target, p_helper, p_kind, p_payload);
  update public.friendships set points = points + p_friendship
   where a = least(p_helper, p_target) and b = greatest(p_helper, p_target) and status = 'accepted';
  return new_rev;
end $$;

revoke execute on function public.game_commit(uuid, integer, uuid, uuid, jsonb, integer, bigint[], text, integer) from public, anon, authenticated;
revoke execute on function public.game_help(uuid, integer, uuid, jsonb, uuid, text, integer, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.gen_friend_code() from public, anon, authenticated;
grant execute on function public.game_commit(uuid, integer, uuid, uuid, jsonb, integer, bigint[], text, integer) to service_role;
grant execute on function public.game_help(uuid, integer, uuid, jsonb, uuid, text, integer, jsonb, integer) to service_role;
grant execute on function public.gen_friend_code() to service_role;
