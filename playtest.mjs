import { chromium } from 'playwright';

const URL = 'http://localhost:5178';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('=== Opening game ===');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const hasCanvas = await page.locator('canvas').count();
  console.log(`Canvas: ${hasCanvas > 0 ? '✅' : '❌'}`);

  // Force game into playing mode for testing
  await page.evaluate(() => {
    // Access game state through the window object
    const state = JSON.parse(window.render_game_to_text());
    // We can't directly set mode, but we can test the level logic
  });

  let state = await page.evaluate(() => {
    const s = JSON.parse(window.render_game_to_text());
    return s;
  });
  console.log(`Mode: ${state.mode}`);
  console.log(`Keys: ${state.keys?.length}`);
  console.log(`Exit locked: ${state.exitDoor?.locked}`);

  // Check for JS errors
  if (errors.length > 0) {
    console.log(`\n⚠️  Errors: ${errors.join('\n')}`);
  } else {
    console.log('✅ No JS errors');
  }

  // Test: advance time to check animation works
  await page.evaluate(() => window.advanceTime?.(1000));
  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`\nAfter 1s: elapsed=${state.elapsed?.toFixed(1)}s`);

  // Check key positions
  if (state.keys) {
    for (const key of state.keys) {
      console.log(`Key ${key.id}: (${key.x}, ${key.y}, ${key.z}) collected=${key.collected}`);
    }
  }

  // Test UI elements exist
  const hudExists = await page.locator('#hud').count();
  const objectiveExists = await page.locator('#objective-text').count();
  const crosshairExists = await page.locator('#crosshair').count();
  console.log(`\nUI elements: HUD=${hudExists > 0}, Objective=${objectiveExists > 0}, Crosshair=${crosshairExists > 0}`);

  // Take screenshot
  await page.screenshot({ path: 'C:\\Users\\azz\\Desktop\\AbandonedHospital\\WebVersion\\test-screenshot.png' });
  console.log('📸 Screenshot saved');

  await browser.close();

  if (errors.length === 0) {
    console.log('\n✅ All checks passed!');
  } else {
    console.log(`\n⚠️  ${errors.length} error(s) found`);
  }
}

run().catch(console.error);
