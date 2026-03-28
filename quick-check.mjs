import { chromium } from 'playwright';

const URL = 'http://localhost:5180';
const OUT = 'C:\\Users\\azz\\Desktop\\AbandonedHospital\\WebVersion\\output\\screenshots';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('🌐 Verbinde...');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(3000);

  let state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log('\n=== SPIELSTART ===');
  console.log(JSON.stringify(state, null, 2));
  await page.screenshot({ path: `${OUT}/quick-01-start.png` });
  console.log('📸 quick-01-start.png');

  // Schlüssel sammeln per Teleport
  console.log('\n=== Teleportiere zu Schlüsseln ===');
  for (const key of state.keys) {
    if (!key.collected) {
      console.log(`Teleport zu ${key.name} (${key.x}, ${key.z})`);
      await page.evaluate(({ x, z }) => window.sim.teleport(x, z), { x: key.x, z: key.z });
      await page.evaluate(() => window.sim.interact());
      await sleep(300);
    }
  }

  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`Schlüssel: ${state.keysCollected.join(', ')} | hasKey: ${state.hasKey}`);
  await page.screenshot({ path: `${OUT}/quick-02-keys.png` });
  console.log('📸 quick-02-keys.png');

  // Zum Ausgang
  console.log('\n=== Zum Ausgang ===');
  await page.evaluate(() => {
    if (window.level?.exitDoor) {
      const p = window.level.exitDoor.position;
      window.sim.teleport(p.x, p.z);
    }
  });
  await sleep(300);
  await page.evaluate(() => window.sim.interact());
  await sleep(300);

  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`Ausgang: locked=${state.exitDoor?.locked} open=${state.exitDoor?.open}`);
  await page.screenshot({ path: `${OUT}/quick-03-exit.png` });
  console.log('📸 quick-03-exit.png');

  // Nochmal interact für Escape
  await page.evaluate(() => window.sim.interact());
  await sleep(500);

  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`\n=== ENDERGEBNIS ===`);
  console.log(`Mode: ${state.mode} | Win: ${state.win} | Message: ${state.message}`);
  await page.screenshot({ path: `${OUT}/quick-04-final.png` });
  console.log('📸 quick-04-final.png');

  // Pixel-Check
  const pixels = await page.evaluate((pos) => window.sim.pixels(pos), [
    [640, 360], [320, 360], [960, 360], [640, 180], [640, 540]
  ]);
  console.log('\n=== PIXELS ===');
  for (const px of pixels) {
    console.log(`  (${px.x},${px.y}): ${px.hex}`);
  }

  if (errors.length > 0) {
    console.log(`\n⚠️ Fehler: ${errors.join(' | ')}`);
  } else {
    console.log('\n✅ Keine JS-Fehler!');
  }

  await browser.close();
  console.log('=== Fertig ===');
}

run().catch(e => { console.error(e); process.exit(1); });
