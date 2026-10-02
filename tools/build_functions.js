// Bundles each Edge Function in supabase/functions/ together with the game rules it imports from src/
// (offline.js, authority.js, data.js, …) into build/functions/<name>/index.js, one self-contained file.
// The server must run exactly the game's rules, so they are never copied by hand: rebuild and redeploy.
//   node tools/build_functions.js
// Fallback for when the Supabase CLI is unavailable (normally: npx supabase functions deploy, see ONLINE.md).
// Deploy the result with the Supabase MCP (deploy_edge_function, verify_jwt off: the function checks the
// user itself) or `npx supabase functions deploy` once the CLI is logged in. See ONLINE.md.
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Run npm's JS entry directly on Windows so spaces in --outfile stay in one argument.
const npx = process.platform === 'win32' ? process.execPath : 'npx';
const npxArgs = process.platform === 'win32' ? [join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js')] : [];
const fnDir = join(root, 'supabase', 'functions');
for (const name of readdirSync(fnDir)) {
  const entry = join(fnDir, name, 'index.ts');
  if (name.startsWith('_') || !existsSync(entry)) continue;
  const out = join(root, 'build', 'functions', name, 'index.js');
  execFileSync(npx, [...npxArgs, '--yes', 'esbuild@0.25', entry, '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
    '--external:npm:*', '--external:jsr:*', '--legal-comments=none', '--minify-whitespace', '--minify-syntax', `--outfile=${out}`], { stdio: 'inherit' });
  console.log(`${name}: ${out} (${(statSync(out).size / 1024).toFixed(1)} KB)`);
}
