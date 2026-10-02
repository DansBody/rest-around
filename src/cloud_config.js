// Where the game's server lives (Supabase). The publishable key is meant to be public: it only lets a
// browser sign in and call the server; what a player may read or write is decided by RLS and the server.
export const SUPABASE_URL = 'https://aizfyuioebmrhmfzsugh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Ai8_1ltJSvVfWY-DMQoCGw_kLV9KEv6';
export const GAME_FN = `${SUPABASE_URL}/functions/v1/game`;
