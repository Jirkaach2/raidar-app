// Re-render raidar-banner.svg → PNG (1x + 2x).
// One-off dependency — run:  npm install --no-save sharp
// then:                      node branding/render.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync(new URL('./raidar-banner.svg', import.meta.url));

// 1x banner (1280x400)
await sharp(svg, { density: 200 })
  .resize(1280, 400)
  .png()
  .toFile(new URL('./raidar-banner.png', import.meta.url).pathname.replace(/^\//, ''));

// 2x retina banner (2560x800)
await sharp(svg, { density: 400 })
  .resize(2560, 800)
  .png()
  .toFile(new URL('./raidar-banner@2x.png', import.meta.url).pathname.replace(/^\//, ''));

console.log('Rendered raidar-banner.png and raidar-banner@2x.png');
