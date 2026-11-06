import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

// Build a multi-size .ico by hand (PNG-in-ICO, supported by Windows Vista+).
const svg = readFileSync('assets/logo.svg');
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = [];
for (const s of sizes) {
  const buf = await sharp(svg).resize(s, s).png().toBuffer();
  pngs.push({ size: s, buf });
}

// ICONDIR header
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + 16 * pngs.length;
for (const p of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(p.size >= 256 ? 0 : p.size, 0);
  e.writeUInt8(p.size >= 256 ? 0 : p.size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(p.buf.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += p.buf.length;
}

const out = Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
writeFileSync('assets/icon.ico', out);
console.log('wrote assets/icon.ico', out.length, 'bytes');
