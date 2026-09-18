// 単色背景に白の「V」を描いた PNG を生成する。依存なし（zlib のみ）。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BG = [0x2e, 0x50, 0x90];
const FG = [0xff, 0xff, 0xff];

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** 点 p から線分 ab までの距離 */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function render(size, { padding }) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const inner = size * (1 - 2 * padding);
  const left = size * padding;
  const top = size * padding;
  // V の 3 点
  const ax = left + inner * 0.18;
  const ay = top + inner * 0.22;
  const bx = left + inner * 0.5;
  const by = top + inner * 0.82;
  const cx = left + inner * 0.82;
  const cy = ay;
  const stroke = inner * 0.09;
  const SS = 3; // スーパーサンプリング
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const d = Math.min(distToSegment(px, py, ax, ay, bx, by), distToSegment(px, py, bx, by, cx, cy));
          if (d <= stroke) cover++;
        }
      }
      const a = cover / (SS * SS);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + FG[i] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/icons/icon-192.png'), render(192, { padding: 0.08 }));
writeFileSync(join(root, 'public/icons/icon-512.png'), render(512, { padding: 0.08 }));
writeFileSync(join(root, 'public/icons/icon-512-maskable.png'), render(512, { padding: 0.2 }));
writeFileSync(join(root, 'public/apple-touch-icon.png'), render(180, { padding: 0.08 }));
console.log('icons written to public/');
