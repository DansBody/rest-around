#!/usr/bin/env node
// Regenerates the asset table in ASSETS.md from assets/manifest.json (optional helper — the game
// itself never needs this). Usage:  node tools/assets-table.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const docPath = path.join(root, 'ASSETS.md');
const START = '<!-- ASSET-TABLE:START -->', END = '<!-- ASSET-TABLE:END -->';

const GROUPS = {
  1: 'Priority 1 — most visible (generate these first)',
  2: 'Priority 2 — core content',
  3: 'Priority 3 — polish',
};

function facing(a) {
  const d = a.directions;
  if (d[0] === 'any') return 'single view';
  if (a.id.startsWith('door')) return 'fl only (left wall)';
  if (a.category === 'wall') return 'fl only (mirrored in code for the right wall)';
  if (d.length === 1) return d[0] + ' only';
  return d.join(' + ') + ' (fr/br = mirrored)';
}
function extras(a) {
  const out = [];
  if (a.footprint && (a.footprint[0] > 1 || a.footprint[1] > 1)) out.push(`footprint ${a.footprint[0]}×${a.footprint[1]} tiles`);
  if (a.heightOffset) out.push(`heightOffset ${a.heightOffset}`);
  if (a.surfaceHeight) out.push(`surface ${a.surfaceHeight}px up`);
  if (a.seatHeight) out.push(`seat ${a.seatHeight}px up`);
  if (a.hingeX != null) out.push(`hingeX ${a.hingeX}`);
  if (a.slice) out.push(`9-slice ${a.slice.join('/')}`);
  if (a.slot) out.push(`slot ${a.slot}`);
  if (a.tintable) out.push('**tintable** (draw light grey)');
  return out.join('; ');
}
function files(a) {
  if (!a.file.includes('{dir}')) return '`' + a.file + '`';
  return a.directions.map((d) => '`' + a.file.replace('{dir}', d) + '`').join('<br>');
}

let md = '';
let total = 0, fileCount = 0;
for (const p of [1, 2, 3]) {
  const list = manifest.assets.filter((a) => (a.priority || 2) === p);
  if (!list.length) continue;
  md += `\n### ${GROUPS[p]}\n\n`;
  md += '| id | file(s) | size (px) | facing | anchor | notes | description |\n|---|---|---|---|---|---|---|\n';
  for (const a of list) {
    total++;
    fileCount += a.directions[0] === 'any' || !a.file.includes('{dir}') ? 1 : a.directions.length;
    const anchor = a.anchor ? `${a.anchor[0]}, ${a.anchor[1]}` : 'center';
    md += `| \`${a.id}\` | ${files(a)} | ${a.size[0]}×${a.size[1]} | ${facing(a)} | ${anchor} | ${extras(a)} | ${a.desc.replace(/\|/g, '/')} |\n`;
  }
}
md = `\n_${total} assets, ${fileCount} PNG files. Generated from \`assets/manifest.json\` by \`node tools/assets-table.mjs\`._\n` + md;

const doc = fs.readFileSync(docPath, 'utf8');
const a = doc.indexOf(START), b = doc.indexOf(END);
if (a < 0 || b < 0) throw new Error('ASSETS.md is missing the table markers');
fs.writeFileSync(docPath, doc.slice(0, a + START.length) + '\n' + md + '\n' + doc.slice(b));
console.log(`ASSETS.md table updated: ${total} assets / ${fileCount} files`);
