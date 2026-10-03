// Vector UI glyphs: Phosphor for the one-colour ones, hand-drawn 24×24 multicolour ones for coins, stars and the like.
// assets.iconEl() uses these for UI icons whose PNG is missing, so a hand-drawn PNG still wins.
const NS = 'http://www.w3.org/2000/svg';

function gearPath(cx, cy, r0, r1, teeth) {
  const pts = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 < 2 ? r1 : r0;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

// One-colour UI glyphs come from Phosphor Icons (bold weight, MIT licence, https://phosphoricons.com):
// filled paths on a 256 grid, drawn in currentColor. They win over the hand-drawn G entries below.
const PH = {
  rotate: ["M228,128a100,100,0,0,1-98.66,100H128a99.39,99.39,0,0,1-68.62-27.29,12,12,0,0,1,16.48-17.45,76,76,0,1,0-1.57-109c-.13.13-.25.25-.39.37L54.89,92H72a12,12,0,0,1,0,24H24a12,12,0,0,1-12-12V56a12,12,0,0,1,24,0V76.72L57.48,57.06A100,100,0,0,1,228,128Z"],
  rotate_r: ["M244,56v48a12,12,0,0,1-12,12H184a12,12,0,1,1,0-24H201.1l-19-17.38c-.13-.12-.26-.24-.38-.37A76,76,0,1,0,127,204h1a75.53,75.53,0,0,0,52.15-20.72,12,12,0,0,1,16.49,17.45A99.45,99.45,0,0,1,128,228h-1.37A100,100,0,1,1,198.51,57.06L220,76.72V56a12,12,0,0,1,24,0Z"],
  move: ["M87.51,64.49a12,12,0,0,1,0-17l32-32a12,12,0,0,1,17,0l32,32a12,12,0,0,1-17,17L140,53V96a12,12,0,0,1-24,0V53L104.49,64.49A12,12,0,0,1,87.51,64.49Zm64,127L140,203V160a12,12,0,0,0-24,0v43l-11.51-11.52a12,12,0,0,0-17,17l32,32a12,12,0,0,0,17,0l32-32a12,12,0,0,0-17-17Zm89-72-32-32a12,12,0,0,0-17,17L203,116H160a12,12,0,0,0,0,24h43l-11.52,11.51a12,12,0,0,0,17,17l32-32A12,12,0,0,0,240.49,119.51ZM53,140H96a12,12,0,0,0,0-24H53l11.52-11.51a12,12,0,1,0-17-17l-32,32a12,12,0,0,0,0,17l32,32a12,12,0,1,0,17-17Z"],
  lock: ["M208,76H180V56A52,52,0,0,0,76,56V76H48A20,20,0,0,0,28,96V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V96A20,20,0,0,0,208,76ZM100,56a28,28,0,0,1,56,0V76H100ZM204,204H52V100H204Z"],
  build: ["M250.18,105.17,186.71,41.25a100.11,100.11,0,0,0-141.43,0l-.13.14L31.37,55.61a12,12,0,1,0,17.24,16.7L62.32,58.16A75.68,75.68,0,0,1,77.49,46.43L119,88,25.85,181.16a20,20,0,0,0,0,28.29l20.69,20.69a20,20,0,0,0,28.28,0L168,137l1.51,1.51h0l23.65,23.66a20,20,0,0,0,28.29,0l28.69-28.7A20,20,0,0,0,250.18,105.17ZM60.68,210.34l-15-15L108,133l15,15ZM140,131l-15-15,19.51-19.51a12,12,0,0,0,0-17L102.24,37.24a75.94,75.94,0,0,1,67.47,20.95l31.44,31.67L178,113l-1.51-1.51a12,12,0,0,0-17,0Zm67.32,11.31L195,130l23.09-23.09,12.3,12.39Z"],
  staff: ["M125.18,156.94a64,64,0,1,0-82.36,0,100.23,100.23,0,0,0-39.49,32,12,12,0,0,0,19.35,14.2,76,76,0,0,1,122.64,0,12,12,0,0,0,19.36-14.2A100.33,100.33,0,0,0,125.18,156.94ZM44,108a40,40,0,1,1,40,40A40,40,0,0,1,44,108Zm206.1,97.67a12,12,0,0,1-16.78-2.57A76.31,76.31,0,0,0,172,172a12,12,0,0,1,0-24,40,40,0,1,0-10.3-78.67,12,12,0,1,1-6.16-23.19,64,64,0,0,1,57.64,110.8,100.23,100.23,0,0,1,39.49,32A12,12,0,0,1,250.1,205.67Z"],
  menu: ["M68,88V40a12,12,0,0,1,24,0V88a12,12,0,0,1-24,0ZM220,40V224a12,12,0,0,1-24,0V180H152a12,12,0,0,1-12-12,273.23,273.23,0,0,1,7.33-57.82C157.42,68.42,176.76,40.33,203.27,29A12,12,0,0,1,220,40ZM196,62.92C182.6,77,175,98,170.77,115.38A254.41,254.41,0,0,0,164.55,156H196ZM128,39A12,12,0,0,0,104,41l4,47.46a28,28,0,0,1-56,0L56,41A12,12,0,1,0,32,39L28,87c0,.34,0,.67,0,1a52.1,52.1,0,0,0,40,50.59V224a12,12,0,0,0,24,0V138.59A52.1,52.1,0,0,0,132,88c0-.33,0-.66,0-1Z"],
  train: ["M220,96A92,92,0,1,0,68,165.69V240a12,12,0,0,0,17.37,10.73L128,229.42l42.64,21.31A12,12,0,0,0,188,240V165.69A91.86,91.86,0,0,0,220,96ZM60,96a68,68,0,1,1,68,68A68.07,68.07,0,0,1,60,96ZM164,220.59l-30.64-15.32a12,12,0,0,0-10.74,0L92,220.58V180.66a92,92,0,0,0,72,0ZM128,148A52,52,0,1,0,76,96,52.06,52.06,0,0,0,128,148Zm0-80a28,28,0,1,1-28,28A28,28,0,0,1,128,68Z"],
  market: ["M236,96a12,12,0,0,0-.44-3.3L221.2,42.51A20.08,20.08,0,0,0,202,28H54A20.08,20.08,0,0,0,34.8,42.51L20.46,92.7A12,12,0,0,0,20,96h0v16a43.94,43.94,0,0,0,16,33.92V216a12,12,0,0,0,12,12H208a12,12,0,0,0,12-12V145.92A43.94,43.94,0,0,0,236,112V96ZM57.05,52H199l9.14,32H47.91Zm91,56v4a20,20,0,0,1-40,0v-4ZM53,128.71A20,20,0,0,1,44,112v-4H84v4a20,20,0,0,1-20,20,19.76,19.76,0,0,1-9.07-2.2A11.54,11.54,0,0,0,53,128.71ZM196,204H60V155.81c1.32.12,2.65.19,4,.19a43.86,43.86,0,0,0,32-13.85,43.89,43.89,0,0,0,64,0A43.86,43.86,0,0,0,192,156c1.35,0,2.68-.07,4-.19Zm16-92a20,20,0,0,1-9,16.71,11.66,11.66,0,0,0-1.88,1.09A20,20,0,0,1,172,112v-4h40Z"],
  settings: ["M128,76a52,52,0,1,0,52,52A52.06,52.06,0,0,0,128,76Zm0,80a28,28,0,1,1,28-28A28,28,0,0,1,128,156Zm113.86-49.57A12,12,0,0,0,236,98.34L208.21,82.49l-.11-31.31a12,12,0,0,0-4.25-9.12,116,116,0,0,0-38-21.41,12,12,0,0,0-9.68.89L128,37.27,99.83,21.53a12,12,0,0,0-9.7-.9,116.06,116.06,0,0,0-38,21.47,12,12,0,0,0-4.24,9.1l-.14,31.34L20,98.35a12,12,0,0,0-5.85,8.11,110.7,110.7,0,0,0,0,43.11A12,12,0,0,0,20,157.66l27.82,15.85.11,31.31a12,12,0,0,0,4.25,9.12,116,116,0,0,0,38,21.41,12,12,0,0,0,9.68-.89L128,218.73l28.14,15.74a12,12,0,0,0,9.7.9,116.06,116.06,0,0,0,38-21.47,12,12,0,0,0,4.24-9.1l.14-31.34,27.81-15.81a12,12,0,0,0,5.85-8.11A110.7,110.7,0,0,0,241.86,106.43Zm-22.63,33.18-26.88,15.28a11.94,11.94,0,0,0-4.55,4.59c-.54,1-1.11,1.93-1.7,2.88a12,12,0,0,0-1.83,6.31L184.13,199a91.83,91.83,0,0,1-21.07,11.87l-27.15-15.19a12,12,0,0,0-5.86-1.53h-.29c-1.14,0-2.3,0-3.44,0a12.08,12.08,0,0,0-6.14,1.51L93,210.82A92.27,92.27,0,0,1,71.88,199l-.11-30.24a12,12,0,0,0-1.83-6.32c-.58-.94-1.16-1.91-1.7-2.88A11.92,11.92,0,0,0,63.7,155L36.8,139.63a86.53,86.53,0,0,1,0-23.24l26.88-15.28a12,12,0,0,0,4.55-4.58c.54-1,1.11-1.94,1.7-2.89a12,12,0,0,0,1.83-6.31L71.87,57A91.83,91.83,0,0,1,92.94,45.17l27.15,15.19a11.92,11.92,0,0,0,6.15,1.52c1.14,0,2.3,0,3.44,0a12.08,12.08,0,0,0,6.14-1.51L163,45.18A92.27,92.27,0,0,1,184.12,57l.11,30.24a12,12,0,0,0,1.83,6.32c.58.94,1.16,1.91,1.7,2.88A11.92,11.92,0,0,0,192.3,101l26.9,15.33A86.53,86.53,0,0,1,219.23,139.61Z"],
  friends: ["M256,136a12,12,0,0,1-12,12h-8v8a12,12,0,0,1-24,0v-8h-8a12,12,0,0,1,0-24h8v-8a12,12,0,0,1,24,0v8h8A12,12,0,0,1,256,136Zm-54.81,56.28a12,12,0,1,1-18.38,15.44C169.12,191.42,145,172,108,172c-28.89,0-55.46,12.68-74.81,35.72a12,12,0,0,1-18.38-15.44A124.08,124.08,0,0,1,63.5,156.53a72,72,0,1,1,89,0A124,124,0,0,1,201.19,192.28ZM108,148a48,48,0,1,0-48-48A48.05,48.05,0,0,0,108,148Z"],
  close: ["M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"],
  back: ["M168.49,199.51a12,12,0,0,1-17,17l-80-80a12,12,0,0,1,0-17l80-80a12,12,0,0,1,17,17L97,128Z"],
  forward: ["M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z"],
  check: ["M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"],
  eye: ["M251,123.13c-.37-.81-9.13-20.26-28.48-39.61C196.63,57.67,164,44,128,44S59.37,57.67,33.51,83.52C14.16,102.87,5.4,122.32,5,123.13a12.08,12.08,0,0,0,0,9.75c.37.82,9.13,20.26,28.49,39.61C59.37,198.34,92,212,128,212s68.63-13.66,94.48-39.51c19.36-19.35,28.12-38.79,28.49-39.61A12.08,12.08,0,0,0,251,123.13Zm-46.06,33C183.47,177.27,157.59,188,128,188s-55.47-10.73-76.91-31.88A130.36,130.36,0,0,1,29.52,128,130.45,130.45,0,0,1,51.09,99.89C72.54,78.73,98.41,68,128,68s55.46,10.73,76.91,31.89A130.36,130.36,0,0,1,226.48,128,130.45,130.45,0,0,1,204.91,156.12ZM128,84a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,84Zm0,64a20,20,0,1,1,20-20A20,20,0,0,1,128,148Z"],
  copy: ["M216,28H88A12,12,0,0,0,76,40V76H40A12,12,0,0,0,28,88V216a12,12,0,0,0,12,12H168a12,12,0,0,0,12-12V180h36a12,12,0,0,0,12-12V40A12,12,0,0,0,216,28ZM156,204H52V100H156Zm48-48H180V88a12,12,0,0,0-12-12H100V52H204Z"],
  mail: ["M224,44H32A12,12,0,0,0,20,56V192a20,20,0,0,0,20,20H216a20,20,0,0,0,20-20V56A12,12,0,0,0,224,44ZM193.15,68,128,127.72,62.85,68ZM44,188V83.28l75.89,69.57a12,12,0,0,0,16.22,0L212,83.28V188Z"],
  save: ["M222.14,69.17,186.83,33.86A19.86,19.86,0,0,0,172.69,28H48A20,20,0,0,0,28,48V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V83.31A19.86,19.86,0,0,0,222.14,69.17ZM164,204H92V160h72Zm40,0H188V156a20,20,0,0,0-20-20H88a20,20,0,0,0-20,20v48H52V52H171l33,33ZM164,84a12,12,0,0,1-12,12H96a12,12,0,0,1,0-24h56A12,12,0,0,1,164,84Z"],
  recenter: ["M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm12,191.13V184a12,12,0,0,0-24,0v27.13A84.18,84.18,0,0,1,44.87,140H72a12,12,0,0,0,0-24H44.87A84.18,84.18,0,0,1,116,44.87V72a12,12,0,0,0,24,0V44.87A84.18,84.18,0,0,1,211.13,116H184a12,12,0,0,0,0,24h27.13A84.18,84.18,0,0,1,140,211.13Z"],
  fast: ["M246.81,111.29,158.63,55.12A19.91,19.91,0,0,0,128,71.84v30L54.63,55.12A19.91,19.91,0,0,0,24,71.84V184.16a19.93,19.93,0,0,0,30.63,16.72L128,154.15v30a19.93,19.93,0,0,0,30.63,16.72l88.18-56.17a19.79,19.79,0,0,0,0-33.42ZM48,176.64V79.36L124.38,128Zm104,0V79.36L228.38,128Z"],
  checklist: ["M228,128a12,12,0,0,1-12,12H128a12,12,0,0,1,0-24h88A12,12,0,0,1,228,128ZM128,76h88a12,12,0,0,0,0-24H128a12,12,0,0,0,0,24Zm88,104H128a12,12,0,0,0,0,24h88a12,12,0,0,0,0-24ZM79.51,39.51,56,63l-7.51-7.52a12,12,0,0,0-17,17l16,16a12,12,0,0,0,17,0l32-32a12,12,0,0,0-17-17Zm0,64L56,127l-7.51-7.52a12,12,0,1,0-17,17l16,16a12,12,0,0,0,17,0l32-32a12,12,0,0,0-17-17Zm0,64L56,191l-7.51-7.52a12,12,0,1,0-17,17l16,16a12,12,0,0,0,17,0l32-32a12,12,0,0,0-17-17Z"],
  sparkles: ["M199,125.31l-49.88-18.39L130.69,57a19.92,19.92,0,0,0-37.38,0L74.92,106.92,25,125.31a19.92,19.92,0,0,0,0,37.38l49.88,18.39L93.31,231a19.92,19.92,0,0,0,37.38,0l18.39-49.88L199,162.69a19.92,19.92,0,0,0,0-37.38Zm-63.38,35.16a12,12,0,0,0-7.11,7.11L112,212.28l-16.47-44.7a12,12,0,0,0-7.11-7.11L43.72,144l44.7-16.47a12,12,0,0,0,7.11-7.11L112,75.72l16.47,44.7a12,12,0,0,0,7.11,7.11L180.28,144ZM140,40a12,12,0,0,1,12-12h12V16a12,12,0,0,1,24,0V28h12a12,12,0,0,1,0,24H188V64a12,12,0,0,1-24,0V52H152A12,12,0,0,1,140,40ZM252,88a12,12,0,0,1-12,12h-4v4a12,12,0,0,1-24,0v-4h-4a12,12,0,0,1,0-24h4V72a12,12,0,0,1,24,0v4h4A12,12,0,0,1,252,88Z"],
  pause: ["M200,28H160a20,20,0,0,0-20,20V208a20,20,0,0,0,20,20h40a20,20,0,0,0,20-20V48A20,20,0,0,0,200,28Zm-4,176H164V52h32ZM96,28H56A20,20,0,0,0,36,48V208a20,20,0,0,0,20,20H96a20,20,0,0,0,20-20V48A20,20,0,0,0,96,28ZM92,204H60V52H92Z"],
};

const STAR = 'M12 2.9l2.75 5.6 6.15.9-4.45 4.35 1.05 6.1L12 16.95 6.5 19.85l1.05-6.1L3.1 9.4l6.15-.9z';

// each glyph: list of [tag, attrs]; `c` = currentColor stroke, fills are explicit
const G = {
  coin: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-gold)', stroke: '#d98a00', 'stroke-width': 1.2 }], ['circle', { cx: 12, cy: 12, r: 6, fill: 'none', stroke: '#fff4c2', 'stroke-width': 1.4, opacity: 0.9 }], ['path', { d: 'M12 8.6v6.8', stroke: '#c77800', 'stroke-width': 1.8 }]],
  star: [['path', { d: STAR, fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1 }]],
  star_empty: [['path', { d: STAR, fill: 'rgba(120,120,135,.22)', stroke: 'rgba(90,90,105,.35)', 'stroke-width': 1 }]],
  points: [['path', { d: 'M7 14.6C4.4 14.1 3.5 11.8 4.4 10 5.2 8.3 7 7.8 8.3 8.3 8.8 6.2 10.3 5 12 5s3.2 1.2 3.7 3.3c1.3-.5 3.1 0 3.9 1.7.9 1.8 0 4.1-2.6 4.6V19H7z', fill: '#fff', stroke: '#ff8a3d', 'stroke-width': 1.6 }], ['path', { d: 'M7 16.3h10', stroke: '#ff8a3d', 'stroke-width': 1.6 }]],
  level: [['path', { d: 'M4.2 17.5 3 7.6l5 3.9 4-6 4 6 5-3.9-1.2 9.9z', fill: 'url(#g-violet)', stroke: '#7b4fe0', 'stroke-width': 1.2 }], ['path', { d: 'M4.6 20h14.8', stroke: '#7b4fe0', 'stroke-width': 1.8 }]],
  clock: [['circle', { cx: 12, cy: 12, r: 9, fill: 'rgba(255,255,255,.55)', stroke: 'c' }], ['path', { d: 'M12 7v5.2l3.4 2.1', stroke: 'c' }]],
  gift: [['path', { d: 'M5.2 12.5h13.6v7.3a1 1 0 0 1-1 1H6.2a1 1 0 0 1-1-1z', fill: '#ff6f9c' }], ['rect', { x: 3.6, y: 8.6, width: 16.8, height: 4, rx: 1, fill: '#ff8fb3' }], ['path', { d: 'M12 8.6v12.2', stroke: '#fff', 'stroke-width': 2 }], ['path', { d: 'M12 8.4C10.6 5 6.6 4.6 6.8 7c.2 1.6 3.2 1.6 5.2 1.4zm0 0c1.4-3.4 5.4-3.8 5.2-1.4-.2 1.6-3.2 1.6-5.2 1.4z', fill: 'none', stroke: '#ff4f86', 'stroke-width': 1.6 }]],
  energy: [['path', { d: 'M13.2 2.6 5 13.4h6.1l-1.3 8 8.2-10.8h-6.1z', fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1.1 }]],
  patience: [['path', { d: 'M7 3.5h10M7 20.5h10', stroke: 'c' }], ['path', { d: 'M8 3.5c0 4.6 8 5.3 8 8.5s-8 3.9-8 8.5M16 3.5c0 4.6-8 5.3-8 8.5s8 3.9 8 8.5', stroke: 'c', 'stroke-width': 1.5 }], ['path', { d: 'M9 19.8c.6-2 2-2.8 3-2.8s2.4.8 3 2.8z', fill: '#ffb340' }]],
  rotate: [['path', { d: 'M4.5 12a7.5 7.5 0 1 0 2.3-5.4', stroke: 'c' }], ['path', { d: 'M5.2 3.6v3.6h3.6', stroke: 'c' }]],
  rotate_r: [['path', { d: 'M19.5 12a7.5 7.5 0 1 1-2.3-5.4', stroke: 'c' }], ['path', { d: 'M18.8 3.6v3.6h-3.6', stroke: 'c' }]],
  move: [['path', { d: 'M12 3.5v17M3.5 12h17M9.5 6 12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5', stroke: 'c' }]],
  sell: [['path', { d: 'M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2-8.8 8.8z', fill: 'rgba(52,199,89,.18)', stroke: 'c' }], ['circle', { cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }]],
  lock: [['rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.6, fill: 'rgba(120,120,135,.25)', stroke: 'c' }], ['path', { d: 'M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5', stroke: 'c' }]],
  water: [['path', { d: 'M12 3.2s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2z', fill: 'url(#g-sky)', stroke: '#2f8fdc', 'stroke-width': 1.1 }], ['path', { d: 'M9.3 14.6a2.8 2.8 0 0 0 2.4 2.7', stroke: '#fff', 'stroke-width': 1.5 }]],
  seed: [['path', { d: 'M12 20.5v-8.5', stroke: '#2f9e44' }], ['path', { d: 'M12 12.5c0-4.2-3-6.3-7.2-6.3 0 4.2 3 6.3 7.2 6.3z', fill: '#69d07a', stroke: '#2f9e44', 'stroke-width': 1.3 }], ['path', { d: 'M12 14.5c0-3.6 2.6-5.6 6.8-5.6 0 3.6-2.6 5.6-6.8 5.6z', fill: '#8fe09a', stroke: '#2f9e44', 'stroke-width': 1.3 }]],
  harvest: [['path', { d: 'M3.5 10.2h17l-2 9.3a1 1 0 0 1-1 .8H6.5a1 1 0 0 1-1-.8z', fill: '#f2c48d', stroke: '#b9793b', 'stroke-width': 1.3 }], ['path', { d: 'M8 10.2l3-6M16 10.2l-3-6', stroke: '#b9793b', 'stroke-width': 1.5 }], ['circle', { cx: 9, cy: 9, r: 2.2, fill: '#ff5f4a' }], ['circle', { cx: 14.2, cy: 8.6, r: 2, fill: '#ffa53d' }]],
  build: [['rect', { x: 9.8, y: 2.8, width: 10, height: 5.2, rx: 1.3, transform: 'rotate(45 14.8 5.4)', fill: 'currentColor', 'fill-opacity': 0.18, stroke: 'c' }], ['path', { d: 'M12.6 11.2 4.4 19.4', stroke: 'c', 'stroke-width': 2.6 }]],
  staff: [['circle', { cx: 9, cy: 8, r: 3.3, stroke: 'c' }], ['path', { d: 'M3.3 19.5c.6-3.5 2.9-5.4 5.7-5.4s5.1 1.9 5.7 5.4', stroke: 'c' }], ['circle', { cx: 16.6, cy: 9, r: 2.6, stroke: 'c' }], ['path', { d: 'M16 14c2.7-.3 4.6 1.4 5.1 4.5', stroke: 'c' }]],
  menu: [['path', { d: 'M6.5 3v5.2a2 2 0 0 0 2 2V21M10.5 3v5.2a2 2 0 0 1-2 2M8.5 3v4.2', stroke: 'c' }], ['path', { d: 'M17 21V3c-2.2 1.6-3.4 4.3-3.4 7.6H17', stroke: 'c' }]],
  garden: [['path', { d: 'M5 19C5 10.2 10.2 5 19 5c0 8.8-5.2 14-14 14z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M5 19 13.5 10.5', stroke: 'c' }]],
  // Training tab: a medal on a ribbon
  train: [['path', { d: 'M8 3.5h8l-2.6 6.6h-2.8z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['circle', { cx: 12, cy: 15, r: 5.4, stroke: 'c' }], ['path', { d: 'M12 12.4l.85 1.75 1.9.27-1.38 1.33.33 1.9L12 16.75l-1.7.9.33-1.9-1.38-1.33 1.9-.27z', fill: 'currentColor' }]],
  bat: [['path', { d: 'M19.6 3.4c1.1 1.1.9 2.6-.5 4L9.6 15.9l-1.5-1.5 8.5-9.5c1.4-1.4 2-2.6 3-1.5z', fill: '#f2c48d', stroke: '#b9793b', 'stroke-width': 1.3 }], ['path', { d: 'M8.1 14.4l1.5 1.5-3.9 3.9a1.06 1.06 0 0 1-1.5-1.5z', fill: '#3a3a44', stroke: '#3a3a44', 'stroke-width': 1 }], ['circle', { cx: 6.2, cy: 6.6, r: 2.4, fill: '#fff', stroke: '#e5484d', 'stroke-width': 1.2 }]],
  run: [['circle', { cx: 14.6, cy: 4.6, r: 2, fill: 'currentColor' }], ['path', { d: 'M6.8 9.3l3.6-2 3.4 1.4 1.6 3 2.9.9M12.4 8.6l-2.2 5.2 3.4 2.4-1 4.3M10.2 13.8l-2.6 3.4-3.4-.4', stroke: 'c', 'stroke-width': 1.9 }], ['path', { d: 'M2.5 9.5h2.6M2 12.5h2.8', stroke: 'c', 'stroke-width': 1.4, opacity: 0.6 }]],
  market: [['path', { d: 'M4.6 8.3h14.8l-1.1 11.3a1 1 0 0 1-1 .9H6.7a1 1 0 0 1-1-.9z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M8.7 10.5V7.3a3.3 3.3 0 0 1 6.6 0v3.2', stroke: 'c' }]],
  settings: [['path', { d: gearPath(12, 12, 6.9, 9, 8), stroke: 'c', 'stroke-width': 1.6, fill: 'currentColor', 'fill-opacity': 0.12 }], ['circle', { cx: 12, cy: 12, r: 2.9, stroke: 'c', 'stroke-width': 1.6 }]],
  heart: [['path', { d: 'M12 20.2s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.6 2.4c0 5.5-7.6 10.1-7.6 10.1z', fill: 'url(#g-rose)', stroke: '#e8385e', 'stroke-width': 1.1 }]],
  angry: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-orange)', stroke: '#e0662a', 'stroke-width': 1.1 }], ['path', { d: 'M7.6 9.2l2.6 1.2M16.4 9.2l-2.6 1.2M8.6 16.4c1.9-1.8 4.9-1.8 6.8 0', stroke: '#7a2e0e', 'stroke-width': 1.6 }]],
  friends: [['circle', { cx: 9.5, cy: 8, r: 3.3, stroke: 'c' }], ['path', { d: 'M3.6 19.5c.6-3.5 2.9-5.4 5.9-5.4 1.4 0 2.6.4 3.6 1.1', stroke: 'c' }], ['path', { d: 'M17.6 20.4s-4-2.4-4-5.3a2.2 2.2 0 0 1 4-1.3 2.2 2.2 0 0 1 4 1.3c0 2.9-4 5.3-4 5.3z', fill: 'url(#g-rose)', stroke: '#e8385e', 'stroke-width': 1 }]],
  mail: [['rect', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 2.6, stroke: 'c' }], ['path', { d: 'm4.5 7 7.5 5.8L19.5 7', stroke: 'c' }]],
  copy: [['rect', { x: 8.5, y: 8.5, width: 11, height: 11, rx: 2.4, stroke: 'c' }], ['path', { d: 'M15.5 5.6V5a1.8 1.8 0 0 0-1.8-1.8H6.3A1.8 1.8 0 0 0 4.5 5v7.4a1.8 1.8 0 0 0 1.8 1.8h.6', stroke: 'c' }]],
  close: [['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11', stroke: 'c', 'stroke-width': 2 }]],
  back: [['path', { d: 'M15 4.5 7.5 12l7.5 7.5', stroke: 'c', 'stroke-width': 2 }]],
  forward: [['path', { d: 'M9 4.5l7.5 7.5L9 19.5', stroke: 'c', 'stroke-width': 2 }]],
  check: [['path', { d: 'M5 12.6l4.4 4.4L19 7.4', stroke: 'c', 'stroke-width': 2.2 }]],
  eye: [['path', { d: 'M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12z', stroke: 'c' }], ['circle', { cx: 12, cy: 12, r: 3, fill: 'currentColor' }]],
  save: [['path', { d: 'M12 3.5v10.5M7.8 10l4.2 4.2 4.2-4.2', stroke: 'c' }], ['path', { d: 'M4 14.5v4a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-4', stroke: 'c' }]],
  recenter: [['circle', { cx: 12, cy: 12, r: 6.5, stroke: 'c' }], ['circle', { cx: 12, cy: 12, r: 2, fill: 'currentColor' }], ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3', stroke: 'c' }]],
  fast: [['path', { d: 'M3.5 6.5 11 12l-7.5 5.5zM12 6.5l7.5 5.5-7.5 5.5z', fill: 'currentColor', stroke: 'c', 'stroke-width': 1.2 }]],
  bowl: [['path', { d: 'M3.5 11.2h17a8.5 8.5 0 0 1-17 0z', fill: 'currentColor', 'fill-opacity': 0.14, stroke: 'c' }], ['path', { d: 'M9 8c0-1.6 1.1-2 1.1-3.6M13.4 8c0-1.6 1.1-2 1.1-3.6', stroke: 'c' }]],
  checklist: [['rect', { x: 4.5, y: 3.5, width: 15, height: 17, rx: 3, stroke: 'c' }], ['path', { d: 'M8 9l1.5 1.5L12 8M8 14.5l1.5 1.5L12 13.5', stroke: 'c' }], ['path', { d: 'M14 9.5h2.5M14 15h2.5', stroke: 'c' }]],
  decor: [['path', { d: 'M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11', stroke: 'c' }], ['path', { d: 'M3.5 12.5a1.8 1.8 0 0 1 3.5-.6V14h10v-2.1a1.8 1.8 0 0 1 3.5.6V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z', stroke: 'c' }], ['path', { d: 'M6 18v1.8M18 18v1.8', stroke: 'c' }]],
  sparkles: [['path', { d: 'M10 3.5c.7 4.2 2.3 5.8 6.5 6.5-4.2.7-5.8 2.3-6.5 6.5-.7-4.2-2.3-5.8-6.5-6.5 4.2-.7 5.8-2.3 6.5-6.5z', fill: 'url(#g-gold)', stroke: '#e39b00', 'stroke-width': 1 }], ['path', { d: 'M18 14.5c.35 2 1.1 2.8 3 3.1-1.9.35-2.65 1.1-3 3.1-.35-2-1.1-2.75-3-3.1 1.9-.3 2.65-1.1 3-3.1z', fill: 'url(#g-gold)' }]],
  dash: [['path', { d: 'M13.5 4.5h6M11 9h8.5M13 13.5h6.5', stroke: 'c', 'stroke-width': 1.8 }], ['path', { d: 'M8.6 3.5 3.8 11.6h4.4L6.9 20.5l6.8-10.2H9.3l2.2-6.8z', fill: 'currentColor', 'fill-opacity': 0.25, stroke: 'c', 'stroke-width': 1.5 }]],
  flame: [['path', { d: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.8 3-5.6 3.6-9.3 2.4 1.4 3.4 3.6 3.2 5.9 1-.8 1.6-2 1.7-3.4 2.4 1.9 4.5 4.3 4.5 7.1 0 3.4-2.7 5.9-6.5 5.9z', fill: 'url(#g-orange)', stroke: '#e0662a', 'stroke-width': 1.2 }], ['path', { d: 'M12 20.5c-1.6 0-2.7-1.1-2.7-2.6 0-1.7 1.3-2.4 1.9-3.9 1.8 1 3.5 2.3 3.5 4 0 1.4-1.1 2.5-2.7 2.5z', fill: '#ffe27a' }]],
  whirl: [['path', { d: 'M4 8.5h10.5a3 3 0 1 0-3-3M3 12.5h15.5a3 3 0 1 1-3 3M5 16.5h6', stroke: 'c', 'stroke-width': 1.9 }]],
  juggle: [['circle', { cx: 6.5, cy: 15.5, r: 3, fill: '#c9a4ff', stroke: '#8a55e6', 'stroke-width': 1.2 }], ['circle', { cx: 17.5, cy: 15.5, r: 3, fill: '#ff9fb1', stroke: '#e0506f', 'stroke-width': 1.2 }], ['circle', { cx: 12, cy: 6, r: 3, fill: '#9fdcff', stroke: '#2f8fdc', 'stroke-width': 1.2 }], ['path', { d: 'M5 11.2C6 7.6 8 6 9.3 5.6M19 11.2C18 7.6 16 6 14.7 5.6', stroke: 'c', 'stroke-width': 1.3, 'stroke-dasharray': '1.5 2.2' }]],
  sad: [['circle', { cx: 12, cy: 12, r: 9, fill: 'url(#g-sky)', stroke: '#2f8fdc', 'stroke-width': 1.1 }], ['path', { d: 'M8.4 16.4c1.9-1.9 5.3-1.9 7.2 0', stroke: '#154a7a', 'stroke-width': 1.6 }], ['circle', { cx: 9, cy: 10.4, r: 1.1, fill: '#154a7a' }], ['circle', { cx: 15, cy: 10.4, r: 1.1, fill: '#154a7a' }], ['path', { d: 'M16.6 12.3s1.3 1.6 1.3 2.4a1.3 1.3 0 0 1-2.6 0c0-.8 1.3-2.4 1.3-2.4z', fill: '#fff' }]],
  zzz: [['path', { d: 'M4 13h6.5L4 20.5h6.5', stroke: '#5b7fd6', 'stroke-width': 2.2 }], ['path', { d: 'M12.5 7h5l-5 5.8h5', stroke: '#7d9be6', 'stroke-width': 1.9 }], ['path', { d: 'M17.5 2.5h3.5l-3.5 4h3.5', stroke: '#a5bbf0', 'stroke-width': 1.6 }]],
  note: [['path', { d: 'M9 17.5V5.5l10-2v12', stroke: '#8a55e6', 'stroke-width': 1.9 }], ['ellipse', { cx: 6.7, cy: 17.6, rx: 2.8, ry: 2.2, fill: '#b58cff', stroke: '#8a55e6', 'stroke-width': 1.2 }], ['ellipse', { cx: 16.7, cy: 15.6, rx: 2.8, ry: 2.2, fill: '#b58cff', stroke: '#8a55e6', 'stroke-width': 1.2 }]],
  broken: [['path', { d: gearPath(12, 12, 6.6, 8.8, 7), fill: '#c9d1da', stroke: '#6b7682', 'stroke-width': 1.3 }], ['circle', { cx: 12, cy: 12, r: 2.6, fill: '#fff', stroke: '#6b7682', 'stroke-width': 1.3 }], ['path', { d: 'M13.5 2.5l-2.4 5.2 2.8 1.2-3.3 5.6', stroke: '#ff4d4f', 'stroke-width': 1.8 }]],
  menucard: [['rect', { x: 4.5, y: 2.5, width: 15, height: 19, rx: 2.4, fill: '#fff8ec', stroke: '#c9772f', 'stroke-width': 1.3 }], ['path', { d: 'M4.5 5a2.4 2.4 0 0 1 2.4-2.5h10.2A2.4 2.4 0 0 1 19.5 5v2.5h-15z', fill: '#ff8a3d' }],
    ['path', { d: 'M8 11.2h8M8 14.2h8M8 17.2h5', stroke: '#c9a27a', 'stroke-width': 1.4 }], ['circle', { cx: 12, cy: 5.1, r: 1.1, fill: '#fff' }]],
  pause: [['rect', { x: 6.5, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }], ['rect', { x: 13.9, y: 5, width: 3.6, height: 14, rx: 1.2, fill: 'currentColor' }]],
};

/** Manifest icon ids that have a vector fallback. */
export const ICON_GLYPHS = {
  icon_coin: 'coin', icon_star: 'star', icon_star_empty: 'star_empty', icon_points: 'points', icon_level: 'level',
  icon_clock: 'clock', icon_gift: 'gift', icon_energy: 'energy', icon_patience: 'patience', icon_rotate: 'rotate',
  icon_move: 'move', icon_sell: 'sell', icon_lock: 'lock', icon_water: 'water', icon_seed: 'seed', icon_harvest: 'harvest',
  tool_build: 'build', tool_staff: 'staff', tool_menu: 'menu', tool_garden: 'garden', tool_train: 'train', tool_market: 'market', tool_friends: 'friends', tool_settings: 'settings',
  emote_heart: 'heart', emote_angry: 'angry', emote_sad: 'sad', emote_zzz: 'zzz', emote_wait: 'patience',
  emote_sparkle: 'sparkles', emote_note: 'note', emote_broken: 'broken', emote_menu: 'menucard',
};

const GRADS = { 'g-gold': ['#ffe27a', '#ffb31f'], 'g-violet': ['#d7b8ff', '#9a6bff'], 'g-sky': ['#9fdcff', '#3fa5f0'], 'g-rose': ['#ff9fb1', '#ff4f74'], 'g-orange': ['#ffc07a', '#ff8a3d'] };

/** Standalone SVG data URL for a glyph (gradients inlined), for drawing on canvases. */
export function glyphDataURL(name, color = '#3a3a44') {
  const el = glyph(name, 128);
  const ser = new XMLSerializer();
  const defs = '<defs>' + Object.entries(GRADS).map(([id, [a, b]]) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`).join('') + '</defs>';
  const inner = [...el.childNodes].map((n) => ser.serializeToString(n)).join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="${NS}" viewBox="-1 -1 26 26" width="128" height="128" style="color:${color}" color="${color}">${defs}${inner}</svg>`);
}

let defsDone = false;
function ensureDefs() {
  if (defsDone || typeof document === 'undefined') return;
  defsDone = true;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.setAttribute('aria-hidden', 'true');
  const grads = GRADS;
  const defs = document.createElementNS(NS, 'defs');
  for (const [id, [a, b]] of Object.entries(grads)) {
    const lg = document.createElementNS(NS, 'linearGradient');
    lg.id = id; lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1');
    for (const [o, c] of [[0, a], [1, b]]) { const s = document.createElementNS(NS, 'stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', c); lg.appendChild(s); }
    defs.appendChild(lg);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}

/** SVG element for a glyph name (see G). */
export function glyph(name, size = 22, cls = 'ico glyph') {
  ensureDefs();
  const parts = G[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', PH[name] ? '0 0 256 256' : '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', cls + ' g-' + name);
  svg.setAttribute('aria-hidden', 'true');
  if (PH[name]) {
    for (const d of PH[name]) { const el = document.createElementNS(NS, 'path'); el.setAttribute('d', d); el.setAttribute('fill', 'currentColor'); svg.appendChild(el); }
    return svg;
  }
  for (const [tag, attrs] of parts || []) {
    const el = document.createElementNS(NS, tag);
    let stroked = false;
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'stroke' && v === 'c') { el.setAttribute('stroke', 'currentColor'); stroked = true; continue; }
      if (k === 'stroke') stroked = true;
      el.setAttribute(k, v);
    }
    if (stroked) {
      if (!attrs['stroke-width']) el.setAttribute('stroke-width', '1.8');
      el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
    }
    if (!attrs.fill) el.setAttribute('fill', 'none');
    svg.appendChild(el);
  }
  return svg;
}

/** Button label helper: glyph + optional text. */
export function gl(name, text, size = 18) {
  const f = document.createDocumentFragment();
  f.appendChild(glyph(name, size));
  if (text) f.appendChild(document.createTextNode(text));
  return f;
}
