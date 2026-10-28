// Build the paper-doll base end to end:
//
//   node tools/doll/export.mjs
//
// Serves the repo, opens tools/dollpreview.html?export in a headless Chrome/Edge, which runs tools/doll/model.js
// and posts every slot's mesh, the skeleton's rest joints and the painted face back; saves that as
// design/paper_doll/build/doll_parts.json and runs tools/build_doll.py on it (skin, clips, glTF into
// assets/models/characters/Doll.gltf). Set CHROME to pick the browser.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'design', 'paper_doll', 'build', 'doll_parts.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

function browser() {
  const tries = [process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const b = tries.find((p) => p && fs.existsSync(p));
  if (!b) throw new Error('no Chrome found: set CHROME to a Chrome/Edge/Chromium binary');
  return b;
}

let child = null;
const done = new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/doll-out') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { res.end('ok'); server.close(); resolve(Buffer.concat(chunks).toString('utf8')); });
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/tools/dollpreview.html?export`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'refillit-doll-chrome-'));
    child = spawn(browser(), ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run',
      '--disable-extensions', `--user-data-dir=${profile}`, '--remote-debugging-port=0', url], { stdio: 'ignore' });
    child.on('exit', (code) => reject(new Error('browser quit before posting the doll (' + code + ')')));
    console.log('building the doll in', path.basename(browser()));
  });
  setTimeout(() => reject(new Error('timed out after 2 minutes')), 120000).unref();
});

try {
  const json = await done;
  child.removeAllListeners('exit'); child.kill();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log('parts', (json.length / 1024).toFixed(0), 'KB ->', path.relative(ROOT, OUT));
  const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(ROOT, 'tools', 'build_doll.py'), OUT], { stdio: 'inherit' });
  process.exit(py.status ?? 1);
} catch (e) {
  if (child) child.kill();
  console.error(e.message);
  process.exit(1);
}
