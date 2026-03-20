import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://localhost:5180';
const OUT = 'C:\\Users\\azz\\Desktop\\AbandonedHospital\\WebVersion\\output\\playwright';

fs.mkdirSync(OUT, { recursive: true });

function log(msg) { console.log(`[${new Date().toISOString().slice(11,19)}] ${msg}`); }

async function getState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function getPixels(page, positions) {
  return page.evaluate((pos) => window.sim.pixels(pos), positions);
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  log(`📸 ${name}.png`);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  log('=== Opening game ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Initial state
  let state = await getState(page);
  log(`Start: player=(${state.player.x}, ${state.player.z}) keys=${state.keys.length} mode=${state.mode}`);
  await screenshot(page, '01-spawn');

  // Sample pixels at spawn
  let pixels = await getPixels(page, [[640,360],[300,360],[980,360],[640,180],[640,540]]);
  log('Spawn pixels: ' + pixels.map(p => `${p.x},${p.y}:${p.hex}`).join(' '));

  // === STEP 1: Walk forward toward corridor ===
  log('--- Step 1: Walk forward toward corridor ---');
  await page.evaluate(() => window.sim.lookAt(0, 16));
  await page.evaluate(() => window.sim.move('w', 3.0));
  state = await getState(page);
  log(`After forward: player=(${state.player.x}, ${state.player.z})`);
  await screenshot(page, '02-forward-corridor');

  pixels = await getPixels(page, [[640,360],[400,360],[880,360]]);
  log('Corridor pixels: ' + pixels.map(p => `${p.x},${p.y}:${p.hex}`).join(' '));

  // === STEP 2: Continue forward to exit area ===
  log('--- Step 2: Continue to exit area ---');
  await page.evaluate(() => window.sim.move('w', 3.0));
  state = await getState(page);
  log(`Near exit: player=(${state.player.x}, ${state.player.z})`);
  await screenshot(page, '03-near-exit');

  // === STEP 3: Go back, turn left toward key1 ===
  log('--- Step 3: Head to key1 (blue, left room top) ---');
  await page.evaluate(() => window.sim.lookAt(-6, 9));
  await page.evaluate(() => window.sim.move('w', 4.0));
  state = await getState(page);
  log(`Heading to key1: player=(${state.player.x}, ${state.player.z})`);
  await screenshot(page, '04-heading-key1');

  // Check if key1 collected (auto-collect radius is 6 units)
  state = await getState(page);
  log(`Key1 collected: ${state.keysCollected.includes('key1')}`);

  // If not, get closer
  if (!state.keysCollected.includes('key1')) {
    log('Getting closer to key1...');
    await page.evaluate(() => window.sim.lookAt(-6, 9));
    await page.evaluate(() => window.sim.move('w', 2.0));
    state = await getState(page);
    log(`Key1 collected: ${state.keysCollected.includes('key1')}`);
    await screenshot(page, '05-key1-area');
  }

  // === STEP 4: Head to key2 (orange, right room bottom) ===
  log('--- Step 4: Head to key2 (orange, right room bottom) ---');
  state = await getState(page);
  if (!state.keysCollected.includes('key2')) {
    await page.evaluate(() => window.sim.lookAt(6, -2));
    await page.evaluate(() => window.sim.move('w', 5.0));
    state = await getState(page);
    log(`Heading to key2: player=(${state.player.x}, ${state.player.z})`);
    log(`Key2 collected: ${state.keysCollected.includes('key2')}`);
    await screenshot(page, '06-heading-key2');

    if (!state.keysCollected.includes('key2')) {
      await page.evaluate(() => window.sim.lookAt(6, -2));
      await page.evaluate(() => window.sim.move('w', 3.0));
      state = await getState(page);
      log(`Key2 collected: ${state.keysCollected.includes('key2')}`);
      await screenshot(page, '07-key2-area');
    }
  }

  // === STEP 5: Both keys collected, go to exit ===
  log('--- Step 5: Go to exit door ---');
  state = await getState(page);
  log(`Keys: ${state.keysCollected.join(', ')} | hasKey=${state.hasKey} | exitUnlocked=${state.exitUnlocked}`);

  await page.evaluate(() => window.sim.lookAt(0, 16));
  await page.evaluate(() => window.sim.move('w', 5.0));
  state = await getState(page);
  log(`At exit: player=(${state.player.x}, ${state.player.z})`);
  await screenshot(page, '08-at-exit');

  // Try to interact with exit
  log('Interacting with exit door...');
  await page.evaluate(() => window.sim.interact());
  state = await getState(page);
  log(`After interact: win=${state.win} mode=${state.mode} message=${state.message}`);
  await screenshot(page, '09-after-interact');

  // === STEP 6: If not won, try reading note ===
  if (!state.win) {
    log('--- Step 6: Reading note ---');
    await page.evaluate(() => window.sim.lookAt(-2.85, -3));
    await page.evaluate(() => window.sim.move('w', 2.0));
    state = await getState(page);
    log(`At note area: player=(${state.player.x}, ${state.player.z})`);
    await screenshot(page, '10-note-area');

    // Try interacting
    await page.evaluate(() => window.sim.interact());
    state = await getState(page);
    log(`Note read: mode=${state.mode} notesRead=${state.notesRead}`);
    await screenshot(page, '11-note-open');

    // Close note
    if (state.mode === 'note') {
      await page.evaluate(() => window.sim.closeNote());
      state = await getState(page);
      log(`Note closed: mode=${state.mode}`);
    }
  }

  // === FINAL: Full walkthrough to win ===
  log('--- FINAL: Full automated walkthrough ---');

  // Reset and do it properly
  state = await getState(page);

  // Step A: Go get key2 (orange, right room at 6, -2)
  log('Getting key2...');
  await page.evaluate(() => window.sim.lookAt(6, -2));
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.sim.move('w', 1.0));
    state = await getState(page);
    if (state.keysCollected.includes('key2')) { log('Key2 collected!'); break; }
  }
  await screenshot(page, '12-after-key2');

  // Step B: Go get key1 (blue, left room at -6, 9)
  state = await getState(page);
  if (!state.keysCollected.includes('key1')) {
    log('Getting key1...');
    await page.evaluate(() => window.sim.lookAt(-6, 9));
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.sim.move('w', 1.0));
      state = await getState(page);
      if (state.keysCollected.includes('key1')) { log('Key1 collected!'); break; }
    }
    await screenshot(page, '13-after-key1');
  }

  // Step C: Go to exit and win
  state = await getState(page);
  log(`Status: keys=${state.keysCollected.join(',')} hasKey=${state.hasKey} exitLocked=${state.exitDoor?.locked}`);

  if (state.hasKey) {
    log('Heading to exit...');
    await page.evaluate(() => window.sim.lookAt(0, 16));
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.sim.move('w', 1.0));
      state = await getState(page);
      if (state.win) { log('🎉 WON!'); break; }
    }
    await screenshot(page, '14-final');

    // Try interact
    await page.evaluate(() => window.sim.interact());
    state = await getState(page);
    log(`Final state: win=${state.win} mode=${state.mode}`);
    await screenshot(page, '15-win');
  }

  // === Pixel analysis at various positions ===
  log('--- Pixel Analysis ---');
  const analysisPositions = [
    [640, 360], [320, 360], [960, 360],
    [640, 180], [640, 540],
    [100, 100], [1180, 100], [100, 620], [1180, 620]
  ];
  pixels = await getPixels(page, analysisPositions);
  for (const px of pixels) {
    log(`  Pixel (${px.x},${px.y}): ${px.hex} rgb(${px.r},${px.g},${px.b})`);
  }

  // Check for errors
  if (errors.length > 0) {
    log(`⚠️ Errors: ${errors.join(' | ')}`);
  } else {
    log('✅ No JS errors');
  }

  log('=== Done ===');
  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
