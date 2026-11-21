// Bridges to the iOS app shell (Capacitor). In a browser or a home-screen web app every function here
// is a cheap no-op, and nothing native is loaded: the Capacitor plugin code is imported lazily, so it
// lives in its own small chunk that the web version never downloads.

// True inside the App Store build, where Capacitor injects window.Capacitor before the page runs.
export function isNativeApp() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

let hapticsEnabled = true;
let hapticsModule = null;
const lastHapticAt = new Map();
// Minimum gap per kind in milliseconds, so repeated events (a racing heartbeat) stay subtle.
const MIN_GAP = { heartbeat: 650, light: 80, medium: 120, heavy: 300, success: 300, warning: 600 };

export function setHapticsEnabled(on) {
  hapticsEnabled = !!on;
}

function loadHaptics() {
  hapticsModule ??= import('@capacitor/haptics').catch(() => null);
  return hapticsModule;
}

// Loads the plugin code at startup in the app, so the first vibration (often the first key) is not late.
export function warmUpHaptics() {
  if (isNativeApp()) loadHaptics();
}

// A short vibration through the iPhone's Taptic Engine.
// kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'heartbeat' (a soft tap).
export function haptic(kind = 'light') {
  if (!hapticsEnabled || !isNativeApp()) return;
  const now = performance.now();
  if (now - (lastHapticAt.get(kind) ?? -Infinity) < (MIN_GAP[kind] ?? 80)) return;
  lastHapticAt.set(kind, now);
  loadHaptics().then((m) => {
    if (!m) return undefined;
    const { Haptics, ImpactStyle, NotificationType } = m;
    switch (kind) {
      case 'success': return Haptics.notification({ type: NotificationType.Success });
      case 'warning': return Haptics.notification({ type: NotificationType.Warning });
      case 'heavy': return Haptics.impact({ style: ImpactStyle.Heavy });
      case 'medium': return Haptics.impact({ style: ImpactStyle.Medium });
      default: return Haptics.impact({ style: ImpactStyle.Light });
    }
  }).catch(() => {});
}
