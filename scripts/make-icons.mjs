// Renders public/icon.svg into every PNG the web app and the iOS app need, with Playwright's Chromium.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-icons.mjs
//
// All PNGs are written as 8-bit RGB (PNG colour type 2) without an alpha channel: App Store Connect
// rejects an app icon that has one (ITMS-90717), and home-screen icons should be opaque anyway.
// The script checks every render is fully opaque before dropping the alpha channel and reads the
// IHDR of each written file back to confirm the colour type.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icon.svg'), 'utf8');
const BACKGROUND = '#050608';

// scale: size of the art relative to the canvas; rounded: draw it as a rounded square (splash logo).
const outputs = [
  { file: 'public/icons/icon-192.png', size: 192 },
  { file: 'public/icons/icon-512.png', size: 512 },
  // Android masks this one to a circle or squircle: the doorway, figure and lamp must stay inside the
  // central 80 % circle, so the art is drawn a little smaller (the corridor runs past the edges).
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: 0.86 },
  { file: 'public/icons/apple-touch-icon.png', size: 180 },
  { file: 'resources/AppIcon-1024.png', size: 1024 },
  // Launch screen artwork for the iOS app: near-black with a small centred logo.
  { file: 'resources/splash-2732.png', size: 2732, scale: 0.15, rounded: true },
];

// The full artwork, or (rounded) a smaller rounded-square logo centred on the dark background.
function page(size, scale = 1, rounded = false) {
  const art = Math.round(size * scale);
  const offset = Math.round((size - art) / 2);
  const radius = rounded ? Math.round(art * 0.225) : 0;
  return `<!doctype html><html><head><style>
    html, body { margin:0; width:${size}px; height:${size}px; overflow:hidden; background:${BACKGROUND}; }
    .art { position:absolute; left:${offset}px; top:${offset}px; width:${art}px; height:${art}px; border-radius:${radius}px; overflow:hidden; }
    .art svg { display:block; width:${art}px; height:${art}px; }
  </style></head><body><div class="art">${svg}</div></body></html>`;
}

// Smaller artwork that still fills the canvas: the viewBox grows around the centre, and the corridor
// surfaces in the SVG already run past its edges, so they simply continue outwards.
function bleedPage(size, scale) {
  const grown = 1024 / scale;
  const origin = 512 - grown / 2;
  return `<!doctype html><html><head><style>
    html, body { margin:0; width:${size}px; height:${size}px; overflow:hidden; background:${BACKGROUND}; }
    svg { display:block; width:${size}px; height:${size}px; }
  </style></head><body>${svg.replace('viewBox="0 0 1024 1024"', `viewBox="${origin} ${origin} ${grown} ${grown}"`)}</body></html>`;
}

function toOpaqueRgb(pngBuffer, label) {
  const img = PNG.sync.read(pngBuffer);
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] !== 255) throw new Error(`${label}: pixel ${(i - 3) / 4} is not opaque (alpha ${img.data[i]})`);
  }
  return PNG.sync.write(img, { colorType: 2, inputColorType: 6, inputHasAlpha: true, bitDepth: 8 });
}

function ihdr(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType: buffer[25] };
}

const launchOptions = { headless: true };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ deviceScaleFactor: 1 });
const tab = await context.newPage();
for (const { file, size, scale = 1, rounded = false } of outputs) {
  await tab.setViewportSize({ width: size, height: size });
  await tab.setContent(rounded || scale === 1 ? page(size, scale, rounded) : bleedPage(size, scale));
  const shot = await tab.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: size, height: size } });
  const out = toOpaqueRgb(shot, file);
  const info = ihdr(out);
  if (info.width !== size || info.height !== size || info.colorType !== 2 || info.bitDepth !== 8) {
    throw new Error(`${file}: unexpected IHDR ${JSON.stringify(info)}`);
  }
  const target = join(root, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, out);
  console.log(`${file}: ${info.width}x${info.height}, 8-bit RGB (colour type ${info.colorType}), ${(out.length / 1024).toFixed(0)} KB`);
}
await browser.close();

// The browser tab icon is the same artwork.
copyFileSync(join(root, 'public/icon.svg'), join(root, 'public/favicon.svg'));
console.log('public/favicon.svg: copied from public/icon.svg');
