// Survival-mode playthrough: a simple stealth bot plays the whole game with the Orderly active.
// Checks that the game can always be won (catches only cost time, never progress) and reports
// how often the bot was caught, as a rough difficulty gauge.
//   npm run dev   # in another shell
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node playtest-orderly.mjs [runs]
import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const runs = Number(process.argv[2] || 3);
const launchOptions = { headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

let failures = 0;
for (let run = 1; run <= runs; run++) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:5180', { waitUntil: 'load' });
  await sleep(3000);

  await page.evaluate(() => {
    const g = window.game;
    g.gameState.settings.orderlyEnabled = true;
    const targets = [
      { name: 'note', x: 0, z: -5.6, act: 'note' },
      { name: 'key2', x: 5.6, z: -1.6 },
      { name: 'key1', x: -5.4, z: 8.8 },
      { name: 'exit', x: 0, z: 14.1, act: 'exit' },
    ];
    window.__bot = { targets, ti: 0, path: null, pi: 0, hunts: 0, lastState: '', log: [], stuck: 0, lastPos: null };
  });

  let result = null;
  for (let chunk = 0; chunk < 420 && !result; chunk++) {
    result = await page.evaluate(() => {
      const g = window.game, b = window.__bot, p = g.player, o = g.orderly, cam = g.camera, gs = g.gameState;
      for (let f = 0; f < 60; f++) {
        if (gs.win) return { win: true };
        if (gs.mode === 'note') { window.game.interaction.closeNote(); continue; }
        if (gs.mode !== 'playing') { b.path = null; window.sim.advance(1); continue; }
        if (o.state === 'hunt' && b.lastState !== 'hunt') b.hunts++;
        b.lastState = o.state;

        const t = b.targets[b.ti];
        const dxT = t.x - cam.position.x, dzT = t.z - cam.position.z;
        if (Math.hypot(dxT, dzT) < 0.7) {
          if (t.act === 'note') { window.sim.lookAt(0, -7); window.sim.steps(2); window.game.interaction.interact(); }
          if (t.act === 'exit') { window.sim.lookAt(0, 17); window.sim.steps(2); window.game.interaction.interact(); }
          if (t.name.startsWith('key') && !gs.keysCollected.includes(t.name)) { window.sim.advance(1); continue; }
          b.ti = Math.min(b.ti + 1, b.targets.length - 1);
          b.path = null;
          continue;
        }
        if (!b.path || b.pi >= b.path.length) {
          b.path = g.nav.findPath(cam.position.x, cam.position.z, t.x, t.z) || [{ x: t.x, z: t.z }];
          b.path.push({ x: t.x, z: t.z });
          b.pi = 1;
        }
        let wp = b.path[Math.min(b.pi, b.path.length - 1)];
        if (Math.hypot(wp.x - cam.position.x, wp.z - cam.position.z) < 0.35) { b.pi++; wp = b.path[Math.min(b.pi, b.path.length - 1)]; }

        const dO = Math.hypot(o.position.x - cam.position.x, o.position.z - cam.position.z);
        const losO = o.state !== 'dormant' && g.nav.hasLineOfSight(o.position.x, o.position.z, cam.position.x, cam.position.z);
        const hunted = o.state === 'hunt';
        p.isSprinting = hunted;
        p.isCrouched = !hunted && losO && dO < 9;
        gs.flashlightOn = !(losO && dO < 12) && gs.battery > 5;
        p.euler.y = Math.atan2(-(wp.x - cam.position.x), -(wp.z - cam.position.z));
        p.moveForward = true;
        const before = gs.catches;
        window.sim.advance(1);
        if (gs.catches > before) b.log.push(`caught near (${cam.position.x.toFixed(1)},${cam.position.z.toFixed(1)}) heading for ${t.name} at ${Math.round(gs.elapsed)}s`);
      }
      // Stuck detection: re-plan if we have not moved for a while.
      const pos = { x: g.camera.position.x, z: g.camera.position.z };
      if (b.lastPos && Math.hypot(pos.x - b.lastPos.x, pos.z - b.lastPos.z) < 0.05 && g.gameState.mode === 'playing') {
        b.stuck++; b.path = null;
      }
      b.lastPos = pos;
      if (g.gameState.elapsed > 400) return { win: false, reason: 'timeout' };
      return null;
    });
  }

  const final = await page.evaluate(() => {
    const g = window.game, b = window.__bot;
    return { elapsed: Math.round(g.gameState.elapsed), catches: g.gameState.catches, hunts: b.hunts, keys: g.gameState.keysCollected, mode: g.gameState.mode, stuckReplans: b.stuck, target: b.targets[b.ti].name, log: b.log };
  });
  const ok = result && result.win && errors.length === 0;
  if (!ok) failures++;
  console.log(`run ${run}: ${ok ? 'WIN' : 'FAIL ' + JSON.stringify(result)} | ${final.elapsed}s game time | caught ${final.catches}x | hunted ${final.hunts}x | keys ${final.keys.join(',')} | stuck replans ${final.stuckReplans} | errors ${errors.length ? errors.join(' / ') : 'none'}`);
  for (const line of final.log) console.log('   ' + line);
  await page.close();
}
await browser.close();
if (failures) { console.log(`${failures}/${runs} runs failed`); process.exit(1); }
console.log(`all ${runs} runs won`);
