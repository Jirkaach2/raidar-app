// One-off asset renderer for the reworked Raidar brand.
//   npm install --no-save sharp
//   node branding/render-all.mjs
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const root = new URL('..', import.meta.url);
const p = (rel) => fileURLToPath(new URL(rel, root));

const favicon = readFileSync(p('public/favicon.svg'));
const banner = readFileSync(p('branding/raidar-banner.svg'));
const iconSrc = readFileSync(p('src-tauri/icons/icon-source.svg'));

const jobs = [
  // Web favicons
  sharp(favicon, { density: 384 }).resize(32, 32).png().toFile(p('public/favicon-32.png')),
  sharp(favicon, { density: 384 }).resize(128, 128).png().toFile(p('public/favicon-128.png')),
  // Banner (1x + 2x)
  sharp(banner, { density: 192 }).resize(1280, 400).png().toFile(p('branding/raidar-banner.png')),
  sharp(banner, { density: 384 }).resize(2560, 800).png().toFile(p('branding/raidar-banner@2x.png')),
  // 1024 master PNG for `tauri icon`
  sharp(iconSrc, { density: 384 }).resize(1024, 1024).png().toFile(p('src-tauri/icons/icon-master.png')),
];

await Promise.all(jobs);
console.log('Rendered favicons, banner (1x/2x) and icon-master.png');
