// Refillit OS: the Mac OS 8 window kit the in-game UI is drawn with (style in os.css). Pixel icons are tiny
// bitmaps ('#' ink, 'o' fill, '.' clear) turned into crisp SVG; CSS colours them through --pi-ink / --pi-fill.
const NS = 'http://www.w3.org/2000/svg';

const BITMAPS = {
  build: ['............', '...######...', '..#oooooo#..', '..#oooooo#..', '...######...', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '....####....', '............'],
  staff: ['............', '...##...##..', '..#oo#.#oo#.', '..#oo#.#oo#.', '...##...##..', '............', '..####.####.', '.#oooo#oooo#', '.#oooo#oooo#', '.#oooo#oooo#', '.##########.', '............'],
  menu: ['...#..#..#..', '....#..#....', '...#..#..#..', '............', '.#########..', '.#ooooooo###', '.#ooooooo#.#', '.#ooooooo###', '..#ooooo#...', '...#####....', '.#########..', '............'],
  train: ['....####....', '...#oooo#...', '..#oo##oo#..', '..#o#..#o#..', '..#oo##oo#..', '...#oooo#...', '....####....', '...#o##o#...', '..#o#..#o#..', '..##....##..', '............', '............'],
  market: ['............', '.##########.', '#o#o#o#o#o##', '#oooooooooo#', '.##########.', '.#........#.', '.#.###..#.#.', '.#.#o#..#.#.', '.#.#o#....#.', '.##########.', '............', '............'],
  settings: ['.....##.....', '..##.##.##..', '..#oo##oo#..', '.##o####o##.', '##o##..##o##', '...#....#...', '...#....#...', '##o##..##o##', '.##o####o##.', '..#oo##oo#..', '..##.##.##..', '.....##.....'],
  today: ['....####....', '.####oo####.', '.#oooooooo#.', '.#oooooo#o#.', '.#ooooo#oo#.', '.##ooo#ooo#.', '.#o#o#oooo#.', '.#oo#ooooo#.', '.#oooooooo#.', '.#o######o#.', '.##########.', '............'],
  friends: ['............', '..###..###..', '.#ooo##ooo#.', '#oooooooooo#', '#oooooooooo#', '#oooooooooo#', '.#oooooooo#.', '..#oooooo#..', '...#oooo#...', '....#oo#....', '.....##.....', '............'],
  skills: ['....#.......', '....#.......', '...#o#......', '.##ooo##....', '...#o#......', '....#....#..', '....#...#o#.', '.......#ooo#', '........#o#.', '.........#..', '............', '............'],
  alert: ['.....##.....', '....#oo#....', '....#oo#....', '...#oooo#...', '...#o##o#...', '..#oo##oo#..', '..#oo##oo#..', '.#ooo##ooo#.', '.#oooooooo#.', '#oooo##oooo#', '############', '............'],
  coin: ['..####..', '.#oooo#.', '#oo##oo#', '#o#oo#o#', '#oo##oo#', '.#oooo#.', '..####..', '........'],
  star: ['....#....', '....#....', '...#o#...', '..#ooo#..', '##ooooo##', '..#ooo#..', '...#o#...', '....#....', '....#....'],
  clock: ['..####..', '.#oooo#.', '#ooo#oo#', '#ooo#oo#', '#ooo##o#', '#oooooo#', '.#oooo#.', '..####..'],
  cup: ['..#.#.#...', '...#.#....', '.#######..', '.#ooooo###', '.#ooooo#.#', '.#ooooo###', '..#ooo#...', '#########.'],
  share: ['.....#......', '....#o#.....', '...#ooo#....', '..#.#o#.#...', '....#o#.....', '.##.#o#.##..', '.#..#o#..#..', '.#...#...#..', '.#.......#..', '.#.......#..', '.#########..', '............'],
  map: ['............', '.##########.', '.#oo#oo#oo#.', '.#oo#oo#oo#.', '.##########.', '.#oo#..#oo#.', '.#oo#..#oo#.', '.##########.', '.#oo#oo#oo#.', '.#oo#oo#oo#.', '.##########.', '............'],
  fast: ['........', '#..#....', '##.##...', '#o##o#..', '#oo#oo#.', '#o##o#..', '##.##...', '#..#....'],
};

/** A pixel icon `px` screen pixels per bitmap pixel. Each row's runs of one colour become one rect. */
export function pixIcon(name, px = 2, cls = '') {
  const rows = BITMAPS[name] || BITMAPS.cup;
  const w = rows[0].length, ht = rows.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${ht}`);
  svg.setAttribute('width', w * px); svg.setAttribute('height', ht * px);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', 'pix pix-' + name + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  rows.forEach((row, y) => {
    for (let x = 0; x < w;) {
      const c = row[x];
      let n = 1;
      while (x + n < w && row[x + n] === c) n++;
      if (c !== '.') {
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', n); r.setAttribute('height', 1);
        r.setAttribute('class', c === '#' ? 'pk' : 'po');
        svg.appendChild(r);
      }
      x += n;
    }
  });
  return svg;
}
