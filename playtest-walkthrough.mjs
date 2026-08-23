// End-to-end playthrough with real physics (no teleporting):
// reads the note, walks to both keys, opens the exit and checks the win state.
//   npm run dev   # in another shell
//   node playthrough.mjs [screenshotDir]
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SP = process.argv[2] || '.';
const launchOptions = { headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errs = [];
page.on('crash', () => console.log('PAGE CRASH'));
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error' && !m.text().includes('ERR_CONNECTION')) errs.push('CONSOLE: '+m.text()); });
await page.goto(process.env.GAME_URL || 'http://localhost:5180', { waitUntil: 'load' });
await sleep(3500);

const S = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
console.log('START:', JSON.stringify(await S()));

// BFS reachability over the real collision boxes
const reach = await page.evaluate(() => {
  const p = window.game.player;
  const step = 0.25, key = (x,z) => x+','+z;
  const start = [0,0], seen = new Set([key(0,0)]), q = [start];
  const free = (x,z) => !p._collides(x,z);
  while (q.length) {
    const [x,z] = q.shift();
    for (const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const nx = Math.round((x+dx)*100)/100, nz = Math.round((z+dz)*100)/100;
      if (Math.abs(nx)>12 || nz>18 || nz<-9) continue;
      const k = key(nx,nz);
      if (seen.has(k) || !free(nx,nz)) continue;
      seen.add(k); q.push([nx,nz]);
    }
  }
  const near = (tx,tz) => [...seen].some(k => { const [a,b]=k.split(',').map(Number); return Math.hypot(a-tx,b-tz) < 1.2; });
  return {
    cells: seen.size,
    key1: near(-6,9), key2: near(6,-2),
    exitDoor: near(0,14.5), note: near(0,-6.2),
  };
});
console.log('REACHABILITY:', JSON.stringify(reach));

// Walk to note and read it
await page.evaluate(() => window.sim.walkTo(0, -6.0, 8));
await page.evaluate(() => window.sim.lookAt(0, -7));
await page.evaluate(() => window.sim.steps(3));
let s = await S();
console.log('at note:', s.player, 'prompt:', s.promptText);
await page.evaluate(() => window.sim.interact());
await sleep(200);
s = await S();
console.log('note mode:', s.mode, 'notesRead:', s.notesRead);
await page.screenshot({ path: `${SP}/after-note.png` });
await page.keyboard.press('Escape');
await sleep(200);
console.log('after escape mode:', (await S()).mode);

// walk to key2 (storage room)
await page.evaluate(() => window.sim.walkTo(6, -1, 12));
await page.evaluate(() => window.sim.walkTo(6, -2, 6));
s = await S(); console.log('key2 run:', s.player, s.keysCollected);

// walk to key1 (file room, through the new doorway)
await page.evaluate(() => window.sim.walkTo(0, 6, 12));
await page.evaluate(() => window.sim.walkTo(-2.5, 8.7, 12));
await page.evaluate(() => window.sim.walkTo(-5, 8.7, 12));
await page.evaluate(() => window.sim.walkTo(-6, 9, 8));
s = await S(); console.log('key1 run:', s.player, s.keysCollected, s.objective);

// to the exit
await page.evaluate(() => window.sim.walkTo(-2, 6, 12));
await page.evaluate(() => window.sim.walkTo(0, 12, 12));
await page.evaluate(() => window.sim.walkTo(0, 14.5, 12));
await page.evaluate(() => window.sim.lookAt(0, 17));
await page.evaluate(() => window.sim.steps(3));
s = await S(); console.log('at exit:', s.player, 'prompt:', s.promptText, 'locked:', s.exitDoor);
await page.evaluate(() => window.sim.interact());
await sleep(400);
s = await S();
console.log('FINAL: win=', s.win, 'mode=', s.mode, 'msg=', s.message, 'pointerLock=', await page.evaluate(()=>!!document.pointerLockElement));
await page.screenshot({ path: `${SP}/after-win.png` });
console.log('errors:', errs.slice(0,8));
await browser.close();
