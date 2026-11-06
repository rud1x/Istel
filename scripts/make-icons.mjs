import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('assets/logo.svg');
const targets = [
  { file: 'assets/icon.png', size: 512 },
  { file: 'assets/tray-icon.png', size: 32 },
  { file: 'assets/favicon.png', size: 256 },
];

for (const t of targets) {
  await sharp(svg).resize(t.size, t.size).png().toFile(t.file);
  console.log('wrote', t.file, t.size);
}
