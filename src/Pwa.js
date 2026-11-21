// Offline support and installation for the web version. The service worker (public/sw.js) is only
// registered over https (GitHub Pages) or, for testing, on localhost with "?sw=1" in the URL, and
// never inside the iOS app, which already ships every file.
import { isNativeApp } from './Native.js';

const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

function isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]';
}

function shouldRegister() {
  if (!('serviceWorker' in navigator) || isNativeApp() || !window.isSecureContext) return false;
  if (location.protocol === 'https:') return true;
  return isLocalhost() && new URLSearchParams(location.search).get('sw') === '1';
}

// Call once the game has loaded: registers the worker and hands it the list of files this page
// fetched before the worker existed, so even the first visit is enough to play offline later.
// When everything is stored, <html data-offline="ready"> is set (used by the playtests).
export async function setUpOffline() {
  if (!shouldRegister()) {
    // A local page without ?sw=1 drops a worker left over from an earlier offline test.
    if ('serviceWorker' in navigator && !isNativeApp() && isLocalhost()) {
      navigator.serviceWorker.getRegistrations?.().then((all) => all.forEach((r) => r.unregister())).catch(() => {});
    }
    return;
  }
  try {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'cached') document.documentElement.dataset.offline = 'ready';
    });
    const registration = await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(BUILD_ID)}`, { scope: './', updateViaCache: 'none' });
    // Talk to this build's worker, which may still be installing; an older one is about to retire.
    const worker = registration.installing || registration.waiting || registration.active;
    if (!worker) return;
    await new Promise((resolve) => {
      if (worker.state === 'activated') resolve();
      else worker.addEventListener('statechange', () => { if (worker.state === 'activated') resolve(); });
    });
    const urls = [location.href, ...performance.getEntriesByType('resource').map((entry) => entry.name)];
    worker.postMessage({ type: 'cache-urls', urls });
  } catch (error) {
    console.warn('[krankenhaus] offline mode unavailable: ' + (error?.message || error));
  }
}

// Chrome and Edge offer installation through an event; the menu shows a button for it then.
export function watchInstallPrompt(button) {
  if (!button || isNativeApp()) return;
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
    button.hidden = false;
  });
  window.addEventListener('appinstalled', () => { prompt = null; button.hidden = true; });
  button.addEventListener('click', async () => {
    if (!prompt) return;
    const pending = prompt;
    prompt = null;
    button.hidden = true;
    try {
      await pending.prompt();
      await pending.userChoice;
    } catch { /* dismissed */ }
  });
}
