// Generates the extension PNG icons (16/32/48/128) with no external deps.
// Motif: indigo rounded square + white "no" ring with a diagonal slash
// (universal "remove" glyph) — legible down to 16px.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../src/icons');
mkdirSync(outDir, { recursive: true });

const BG = [0x6d, 0x5e, 0xf3]; // indigo
const FG = [0xff, 0xff, 0xff]; // white

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function png(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = pixels[i];
      raw[p++] = pixels[i + 1];
      raw[p++] = pixels[i + 2];
      raw[p++] = pixels[i + 3];
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const s = size;
  const radius = s * 0.22; // rounded corners
  const cx = s / 2;
  const cy = s / 2;
  const ringR = s * 0.30;
  const ringT = Math.max(1.4, s * 0.085); // ring thickness
  const slashT = ringT;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      // rounded-square mask
      const rx = Math.max(radius - x, x - (s - radius), 0);
      const ry = Math.max(radius - y, y - (s - radius), 0);
      const inCorner = rx > 0 && ry > 0;
      const inside = inCorner ? Math.hypot(rx, ry) <= radius : true;
      if (!inside) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
        continue;
      }
      let col = BG;
      const d = Math.hypot(x - cx, y - cy);
      const onRing = Math.abs(d - ringR) <= ringT / 2;
      // diagonal slash (top-left -> bottom-right), clipped to ring interior
      const distToDiag = Math.abs((x - cx) - (y - cy)) / Math.SQRT2;
      const onSlash = distToDiag <= slashT / 2 && d <= ringR + ringT / 2;
      if (onRing || onSlash) col = FG;
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon${size}.png`), png(size, render(size)));
  console.log(`wrote icon${size}.png`);
}
