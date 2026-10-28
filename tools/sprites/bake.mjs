// Bake one character's pixel sprite sheet (design/art-direction/PLAN.md, step 2), end to end:
//
//   node tools/sprites/bake.mjs mochalatte [--keep] [--grid doll] [--out dir]
//
// Serves the repo, opens tools/sprites/bake.html in a headless Chrome/Edge (software WebGL, so every machine bakes
// the same pixels), takes the SUPER× frames it posts back, and runs tools/sprites/pixelize.py on them into
// assets/sprites/<id>/<id>.png + <id>.json. Set CHROME to pick the browser. --keep leaves the raw frames in the temp dir.
// --grid bakes on another grid of schedule.json than the manifest names (a trial of the 64×96 doll cell), --out writes
// the sheet somewhere else than assets/sprites/<id> (so a trial leaves the game's sheet alone).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const id = process.argv[2];
if (!id) { console.error('usage: node tools/sprites/bake.mjs <character id> [--keep]'); process.exit(1); }
const keep = process.argv.includes('--keep');
const opt = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const gridName = opt('--grid'), outDir = opt('--out') ? path.resolve(opt('--out')) : path.join(ROOT, 'assets', 'sprites', id);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function browser() {
  const tries = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const b = tries.find((p) => p && fs.existsSync(p));
  if (!b) throw new Error('no Chrome found: set CHROME to a Chrome/Edge/Chromium binary');
  return b;
}

const raw = path.join(os.tmpdir(), 'refillit-bake', id);
let child = null;
const done = new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/bake-out') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { res.end('ok'); server.close(); resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); });
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/tools/sprites/bake.html?c=${encodeURIComponent(id)}&post${gridName ? '&grid=' + encodeURIComponent(gridName) : ''}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refillit-bake-chrome-'));
    child = spawn(browser(), ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
      '--disable-extensions', `--user-data-dir=${profile}`, '--remote-debugging-port=0', url], { stdio: 'ignore' });
    child.on('exit', (code) => reject(new Error('browser quit before posting the frames (' + code + ')')));
    console.log('baking', id, 'in', path.basename(browser()));
  });
  setTimeout(() => reject(new Error('timed out after 5 minutes')), 300000).unref();
});

try {
  const { cells, ears = [], grid } = await done;
  child.removeAllListeners('exit'); child.kill();
  fs.rmSync(raw, { recursive: true, force: true });
  fs.mkdirSync(raw, { recursive: true });
  // a frame, and its mask render for a recoloured body (cell_0000.png, cell_0000_mask.png; ears ear_00.png, ...)
  const save = (list, name, pad) => list.forEach((c, i) => {
    for (const k of ['png', 'mask']) {
      if (!c[k]) continue;
      fs.writeFileSync(path.join(raw, `${name}_${String(i).padStart(pad, '0')}${k === 'mask' ? '_mask' : ''}.png`), Buffer.from(c[k].split(',')[1], 'base64'));
      if (k === 'mask') c.mask = true; else delete c.png;
    }
  });
  save(cells, 'cell', 4);
  save(ears, 'ear', 2);
  fs.writeFileSync(path.join(raw, 'cells.json'), JSON.stringify(cells));
  if (ears.length) fs.writeFileSync(path.join(raw, 'ears.json'), JSON.stringify(ears));
  if (grid) fs.writeFileSync(path.join(raw, 'grid.json'), JSON.stringify(grid));   // the grid it was baked on (furniture has its own)
  console.log(cells.length, 'frames rendered');
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    [path.join(ROOT, 'tools', 'sprites', 'pixelize.py'), raw, outDir, id], { stdio: 'inherit' });
  if (!keep) fs.rmSync(raw, { recursive: true, force: true });
  process.exit(py.status ?? 1);
} catch (e) {
  if (child) child.kill();
  console.error(e.message);
  process.exit(1);
}
