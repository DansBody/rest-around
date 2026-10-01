#!/usr/bin/env node
// Regenerates the asset tables in ASSETS.md from assets/manifest.json (optional helper — the game
// itself never needs this). Usage:  node tools/assets-table.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const docPath = path.join(root, 'ASSETS.md');
const esc = (s) => String(s || '').replace(/\|/g, '/');

function modelSource(m) {
  if (m.parts) return 'composite: ' + m.parts.map((p) => '`' + p.model + '`').join(' + ');
  if (m.file) return '`' + m.file + '`';
  return '_procedural placeholder_ (`' + (m.placeholder && m.placeholder.shape) + '`)';
}
function modelNotes(m) {
  const out = [];
  if (m.footprint && (m.footprint[0] > 1 || m.footprint[1] > 1)) out.push(`footprint ${m.footprint[0]}×${m.footprint[1]}`);
  if (m.surfaceHeight) out.push(`surface ${m.surfaceHeight}`);
  if (m.seatHeight) out.push(`seat ${m.seatHeight}`);
  if (m.rotY) out.push(`rotY ${m.rotY}°`);
  if (m.scale) out.push(`scale ${m.scale}`);
  if (m.tintable) out.push('tintable');
  if (m.accessories && m.accessories.length) out.push('accessories: ' + m.accessories.join(', '));
  if (m.animations) out.push('own rig + clips');
  return out.join('; ');
}

let md = '';
const groups = [['furniture', 'Furniture'], ['kitchen', 'Kitchen'], ['fun', 'Fun'], ['decor', 'Decor'], ['prop', 'Props'], ['food', 'Food & ingredients'], ['character', 'Characters']];
md += `\n### 3D models (${manifest.models.length})\n`;
for (const [cat, title] of groups) {
  const list = manifest.models.filter((m) => m.category === cat);
  if (!list.length) continue;
  md += `\n**${title}**\n\n| id | source | notes |\n|---|---|---|\n`;
  for (const m of list) md += `| \`${m.id}\` | ${modelSource(m)} | ${esc(modelNotes(m))} |\n`;
}
md += `\n### 2D images (${manifest.assets.length})\n\n| id | file | size (px) | notes |\n|---|---|---|---|\n`;
for (const a of manifest.assets) {
  const notes = [a.tintable ? 'tintable' : '', a.slice ? `9-slice ${a.slice.join('/')}` : '', a.model ? `rendered from model \`${a.model}\` unless the PNG exists` : ''].filter(Boolean).join('; ');
  md += `| \`${a.id}\` | \`${a.file}\` | ${a.size[0]}×${a.size[1]} | ${esc(notes)} |\n`;
}

const START = '<!-- ASSET-TABLE:START -->', END = '<!-- ASSET-TABLE:END -->';
const doc = fs.readFileSync(docPath, 'utf8');
const i = doc.indexOf(START), j = doc.indexOf(END);
if (i < 0 || j < 0) throw new Error('ASSETS.md is missing the table markers');
fs.writeFileSync(docPath, doc.slice(0, i + START.length) + '\n' + md + '\n' + doc.slice(j));
console.log(`ASSETS.md updated: ${manifest.models.length} models, ${manifest.assets.length} images`);
