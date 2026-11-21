// Bridges to the iOS app shell (Capacitor). In a browser or a home-screen web app every function here
// is a cheap no-op, and nothing native is loaded.

// True inside the App Store build, where Capacitor injects window.Capacitor before the page runs.
export function isNativeApp() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}
