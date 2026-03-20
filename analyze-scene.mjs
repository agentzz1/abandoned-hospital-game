import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://localhost:5180';
const OUT = 'C:\\Users\\azz\\Desktop\\AbandonedHospital\\WebVersion\\output\\final';
fs.mkdirSync(OUT, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(4000);

  // Helper: read pixels from canvas
  async function readPixels(positions) {
    return page.evaluate((pos) => {
      window.sim.steps(1);
      const canvas = document.querySelector('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return pos.map(p => {
        const px = new Uint8Array(4);
        gl.readPixels(p[0], p[1], 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { x: p[0], y: p[1], r: px[0], g: px[1], b: px[2], hex: '#' + [px[0],px[1],px[2]].map(c => c.toString(16).padStart(2,'0')).join(''), brightness: Math.round((px[0]+px[1]+px[2])/3) };
      });
    }, positions);
  }

  // Helper: teleport and screenshot
  async function visit(name, x, z, lookX, lookZ) {
    await page.evaluate(({x,z,lx,lz}) => {
      window.sim.teleport(x, z);
      window.sim.lookAt(lx, lz);
      window.sim.steps(5);
    }, { x, z, lx: lookX, lz: lookZ });
    
    await page.screenshot({ path: `${OUT}/${name}.png` });
    
    const px = await readPixels([
      [640,360],[400,360],[880,360],[640,200],[640,500],
      [200,360],[1080,360]
    ]);
    
    const avgBright = Math.round(px.reduce((s,p) => s+p.brightness, 0) / px.length);
    console.log(`${name}: avg=${avgBright} center=${px[0].hex} left=${px[5].hex} right=${px[6].hex}`);
    return px;
  }

  console.log('=== Scene Analysis ===');
  
  // Visit key locations
  await visit('01-spawn-look-south', 0, 0, 0, -5);
  await visit('02-spawn-look-north', 0, 0, 0, 10);
  await visit('03-corridor-mid', 0, 5, 0, 10);
  await visit('04-corridor-near-exit', 0, 12, 0, 16);
  await visit('05-key1-room', -6, 8, -6, 9);
  await visit('06-key2-room', 6, -1, 6, -2);
  await visit('07-waiting-room', -7, 0, -7, -3);
  await visit('08-storage-room', 7, 0, 7, 2);
  await visit('09-file-room', -7, 9, -8, 11);
  await visit('10-op-room', 7, 8, 7, 10);
  await visit('11-exit-door', 0, 15, 0, 16);

  // Full automated playthrough
  console.log('\n=== Automated Playthrough ===');
  
  // Collect key2
  await page.evaluate(() => { window.sim.teleport(6, -2); window.sim.steps(10); });
  let state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`Key2: ${state.keysCollected.includes('key2') ? 'COLLECTED' : 'missed'}`);
  await page.screenshot({ path: `${OUT}/12-key2-collected.png` });

  // Collect key1
  await page.evaluate(() => { window.sim.teleport(-6, 9); window.sim.steps(10); });
  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`Key1: ${state.keysCollected.includes('key1') ? 'COLLECTED' : 'missed'} | hasKey=${state.hasKey}`);
  await page.screenshot({ path: `${OUT}/13-key1-collected.png` });

  // Go to exit
  await page.evaluate(() => { 
    window.sim.teleport(0, 15); 
    window.sim.lookAt(0, 16); 
    window.sim.steps(10); 
  });
  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`Exit: prompt="${state.promptText}" locked=${state.exitDoor.locked}`);
  await page.screenshot({ path: `${OUT}/14-at-exit.png` });

  // Interact to win
  await page.evaluate(() => window.sim.interact());
  state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  console.log(`WIN: ${state.win} | mode=${state.mode} | msg="${state.message}"`);
  await page.screenshot({ path: `${OUT}/15-win.png` });

  console.log('\n=== Done ===');
  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
