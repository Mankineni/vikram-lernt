#!/usr/bin/env node
/*
 * gen-icons.js — emits icons/icon-192.png and icons/icon-512.png.
 * Pure Node, no dependencies. Flat blue square with "VL" in white,
 * rendered from a 5x7 bitmap font scaled up to the target size.
 * Re-run whenever branding changes. Output is checked into git.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x4a, 0x90, 0xe2];  // --color-math
const FG = [0xff, 0xff, 0xff];  // white

const FONT = {
  V: [
    '10001',
    '10001',
    '10001',
    '10001',
    '01010',
    '01010',
    '00100',
  ],
  L: [
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '10000',
    '11111',
  ],
};

function buildRGBA(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4]     = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 0xff;
  }

  // "VL": 5 + 1(gap) + 5 = 11 glyph-cells wide, 7 tall. Fit to ~55% of image.
  const scale = Math.max(1, Math.floor((size * 0.55) / 11));
  const textW = 11 * scale;
  const textH = 7 * scale;
  const x0 = Math.floor((size - textW) / 2);
  const y0 = Math.floor((size - textH) / 2);

  const drawGlyph = (letter, colOffset) => {
    const rows = FONT[letter];
    for (let ry = 0; ry < 7; ry++) {
      for (let rx = 0; rx < 5; rx++) {
        if (rows[ry][rx] !== '1') continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const x = x0 + colOffset + rx * scale + px;
            const y = y0 + ry * scale + py;
            const idx = (y * size + x) * 4;
            buf[idx]     = FG[0];
            buf[idx + 1] = FG[1];
            buf[idx + 2] = FG[2];
            buf[idx + 3] = 0xff;
          }
        }
      }
    }
  };

  drawGlyph('V', 0);
  drawGlyph('L', 6 * scale);   // 5 glyph cols + 1 gap
  return buf;
}

// --- PNG encoder ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, payload, crc]);
}

function encodePng(size, rgba) {
  const rowLen = size * 4;
  const raw = Buffer.alloc(size * (rowLen + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (rowLen + 1)] = 0; // filter: none
    rgba.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type: truecolor + alpha (RGBA)
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- main ---------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const rgba = buildRGBA(size);
  const png  = encodePng(size, rgba);
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
