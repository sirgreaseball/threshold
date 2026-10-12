// Settings this device remembers, in first-party cookies: the minimum, how it
// is counted, the lab minimum and the theme. Never courses, names or counts:
// those stay in the page's memory and are gone with the tab.

const YEAR = 60 * 60 * 24 * 365;
const PREFIX = 'th_';

export function getSetting(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${PREFIX}${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function setSetting(name, value) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const cookie =
    value == null || value === ''
      ? `${PREFIX}${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${PREFIX}${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`;
  document.cookie = cookie;
}

const pct = (s) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};

/** The college's rule as last chosen on this device: { min, mode, labMin }, each null when unknown. */
export function savedRule() {
  return { min: pct(getSetting('min')), mode: getSetting('mode') === 'separate' ? 'separate' : null, labMin: pct(getSetting('labmin')) };
}

let last = '';
export function saveRule(rule) {
  const sig = `${rule.min}|${rule.mode}|${rule.labMin}`;
  if (sig === last) return;
  last = sig;
  setSetting('min', rule.min);
  setSetting('mode', rule.mode === 'separate' ? 'separate' : null);
  setSetting('labmin', rule.labMin);
}
