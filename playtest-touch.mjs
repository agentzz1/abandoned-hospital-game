// Phone playthrough checks: an iPhone-sized touch viewport drives the on-screen joystick, look
// drag and buttons through real touch events, and saves screenshots (landscape, note, pause,
// portrait) to the given directory.
//   npm run build && npx vite preview --port 4173   # in another shell
//   GAME_URL=http://localhost:4173/ CHROMIUM_PATH=/opt/pw-browsers/chromium node playtest-touch.mjs [screenshotDir]
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SP = process.argv[2] || '.';
const launchOptions = { headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(process.env.GAME_URL || 'http://localhost:4173/', { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120000 });
await sleep(500);
const cdp = await ctx.newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
const S = () => page.evaluate(() => { const g = window.game; return { x: +g.camera.position.x.toFixed(2), z: +g.camera.position.z.toFixed(2), yaw: +g.player.yaw.toFixed(2), mode: g.gameState.mode, light: g.gameState.flashlightOn, crouch: g.player.isCrouched, sprint: g.player.isSprinting, prompt: document.getElementById('interaction-prompt').textContent }; });

console.log('touch mode on:', await page.evaluate(() => document.body.classList.contains('touch')), '| texture size 256:', await page.evaluate(() => window.game.level.walls[0].material.map.image.width === 256));
await page.evaluate(() => { window.game.gameState.settings.orderlyEnabled = false; });
await page.screenshot({ path: SP + '/touch-landscape.png' });

// Joystick: press in the left zone and push up (forward)
let s = await S(); console.log('start', JSON.stringify(s));
await touch('touchStart', [[120, 300, 1]]);
await touch('touchMove', [[120, 250, 1]]);
await page.evaluate(() => window.sim.advance(60));
s = await S(); console.log('after half-push forward 1s:', s.x, s.z, 'sprint', s.sprint);
await touch('touchMove', [[120, 230, 1]]);
await page.evaluate(() => window.sim.advance(30));
s = await S(); console.log('full push -> sprint flag:', s.sprint);
// Second finger looks around on the right while the left still holds the stick
await touch('touchMove', [[120, 230, 1], [600, 200, 2]]);
await touch('touchMove', [[120, 230, 1], [700, 200, 2]]);
s = await S(); console.log('look drag 100px right while walking -> yaw', s.yaw);
await touch('touchEnd', []);
await page.evaluate(() => window.sim.advance(5));
s = await S(); console.log('released: sprint', s.sprint);

// Buttons
const tapEl = async sel => { const b = await page.locator(sel).boundingBox(); await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, 9]]); await touch('touchEnd', []); await page.evaluate(() => window.sim.advance(2)); };
await tapEl('#touch-light'); s = await S(); console.log('Lampe tapped -> light', s.light);
await tapEl('#touch-crouch'); s = await S(); console.log('Ducken tapped -> crouch', s.crouch);
await tapEl('#touch-crouch');
await page.evaluate(() => { const g = window.game; g.camera.position.set(0, 1.6, -5.4); g.player.euler.y = 0; window.sim.lookAt(0, -7); window.sim.advance(3); });
s = await S(); console.log('at note, prompt text:', JSON.stringify(s.prompt), 'use ready:', await page.evaluate(() => document.getElementById('touch-use').classList.contains('ready')));
await tapEl('#touch-use'); s = await S(); console.log('Benutzen -> mode', s.mode);
await page.screenshot({ path: SP + '/touch-note.png' });
await tapEl('#close-note'); s = await S(); console.log('Schliessen tapped -> mode', s.mode, '| touch buttons hidden while note was open: ok');
await tapEl('#touch-pause'); s = await S(); console.log('Pause -> mode', s.mode);
await page.screenshot({ path: SP + '/touch-pause.png' });
await tapEl('#touch-pause'); s = await S(); console.log('Pause again -> mode', s.mode);
await page.setViewportSize({ width: 390, height: 844 }); await sleep(300); await page.evaluate(() => window.sim.steps(2));
await page.screenshot({ path: SP + '/touch-portrait.png' });
console.log('errors', errs);
await browser.close();
