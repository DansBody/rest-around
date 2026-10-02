// Copies what the browser needs into dist/ for hosting (Cloudflare Pages runs this as its build command).
// Tools, server code, docs and editor config stay out of the published site.
//   node tools/build_site.js
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'dist');
const PUBLISH = ['index.html', 'src', 'assets', 'vendor'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of PUBLISH) cpSync(join(root, p), join(out, p), { recursive: true });

let files = 0, bytes = 0;
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f), s = statSync(p);
  if (s.isDirectory()) walk(p); else { files++; bytes += s.size; }
});
walk(out);
console.log(`dist: ${files} files, ${(bytes / 1048576).toFixed(1)} MB`);
