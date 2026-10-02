-- A player's face on friend lists: a nickname (empty = show the café name) and an avatar, one of our own
-- characters on a coloured disc (validated by the server against social.js AVATAR).
alter table public.profiles
  add column nickname text not null default '',
  add column avatar jsonb not null default '{"model": "mochalatte", "bg": "#f6d7c3"}';
