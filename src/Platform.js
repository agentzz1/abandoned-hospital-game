// What the game runs on: Apple's WebKit version (it differs between iOS releases), iPhone/iPad
// detection that also works inside the iOS app's WKWebView, and whether it was started from the
// home screen. Everything is read from the user agent once, without any network access.

// iOS/iPadOS version, e.g. 17.05 for 17.5. NaN when the device is not an iPhone, iPad or iPod;
// 0 for an iPad that reports a desktop user agent without telling its version.
// WKWebView user agents have no "Version/" or "Safari/" token, so the OS token is the main source;
// Safari 26 and later freeze that token at 18_6, so a higher "Version/" wins.
export function iosVersion(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints || 0) {
  const m = ua.match(/\((?:iPhone|iPad|iPod)[^)]*?\bOS (\d+)[_.](\d+)/);
  let v = m ? +m[1] + +m[2] / 100 : NaN;
  if (Number.isNaN(v) && /\(Macintosh;/.test(ua) && maxTouchPoints > 1) v = 0;
  if (Number.isNaN(v)) return NaN;
  const s = ua.match(/Version\/(\d+)(?:\.(\d+))?.*Safari\//);
  if (s) v = Math.max(v, +s[1] + +(s[2] || 0) / 100);
  return v;
}

export function isIOS() {
  return !Number.isNaN(iosVersion());
}

// The WebKit release behind Apple's browsers: the iOS version on iPhone and iPad, Safari's version
// on the Mac (0 when unknown). NaN for other engines: Chrome, Edge and Firefox on desktop and Android.
export function appleWebKitVersion(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints || 0) {
  const ios = iosVersion(ua, maxTouchPoints);
  if (!Number.isNaN(ios)) return ios;
  if (!/AppleWebKit\//.test(ua) || /(Chrome|Chromium|Edg|OPR|Firefox)\//.test(ua)) return NaN;
  const s = ua.match(/Version\/(\d+)(?:\.(\d+))?/);
  return s ? +s[1] + +(s[2] || 0) / 100 : 0;
}

// Started from the home screen as an installed web app (no browser toolbar around it).
export function isStandalone() {
  try {
    return navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches;
  } catch {
    return false;
  }
}
