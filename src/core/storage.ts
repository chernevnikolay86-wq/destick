// Durable per-origin prefs in chrome.storage.local (§Permissions: `storage` only,
// never `.sync` — 100% local, no account).
import { DEFAULT_PREFS, type Rule, type SitePrefs } from './types';
import { STORAGE_PREFIX } from './messages';

function key(origin: string): string {
  return STORAGE_PREFIX + origin;
}

export async function getPrefs(origin: string): Promise<SitePrefs> {
  try {
    const k = key(origin);
    const got = await chrome.storage.local.get(k);
    const v = got[k] as SitePrefs | undefined;
    if (!v) return { ...DEFAULT_PREFS, pickedRules: [] };
    return {
      autoClean: !!v.autoClean,
      pickedRules: Array.isArray(v.pickedRules) ? v.pickedRules : [],
    };
  } catch {
    return { ...DEFAULT_PREFS, pickedRules: [] };
  }
}

export async function setPrefs(origin: string, prefs: SitePrefs): Promise<void> {
  await chrome.storage.local.set({ [key(origin)]: prefs });
}

/**
 * Strict read for read-modify-write callers: unlike getPrefs it does NOT swallow a read
 * failure into empty defaults — otherwise a transient read error would let a subsequent
 * write clobber the user's saved rules. The error propagates so the caller aborts.
 */
async function readPrefsStrict(origin: string): Promise<SitePrefs> {
  const k = key(origin);
  const got = await chrome.storage.local.get(k); // may throw → caller must not write
  const v = got[k] as SitePrefs | undefined;
  if (!v) return { ...DEFAULT_PREFS, pickedRules: [] };
  return {
    autoClean: !!v.autoClean,
    pickedRules: Array.isArray(v.pickedRules) ? v.pickedRules : [],
  };
}

export async function setAutoClean(origin: string, autoClean: boolean): Promise<void> {
  const p = await readPrefsStrict(origin); // a read failure aborts, never writes []
  p.autoClean = autoClean;
  await setPrefs(origin, p);
}

export async function addRule(origin: string, rule: Rule): Promise<void> {
  const p = await readPrefsStrict(origin);
  p.pickedRules.push(rule);
  await setPrefs(origin, p);
}

export async function deleteRule(origin: string, index: number): Promise<void> {
  const p = await readPrefsStrict(origin);
  if (index >= 0 && index < p.pickedRules.length) {
    p.pickedRules.splice(index, 1);
    await setPrefs(origin, p);
  }
}

export async function resetSite(origin: string): Promise<void> {
  // §State model: reset-site clears rules AND turns autoClean off.
  await setPrefs(origin, { autoClean: false, pickedRules: [] });
}

export async function listOrigins(): Promise<{ origin: string; prefs: SitePrefs }[]> {
  const all = await chrome.storage.local.get(null);
  const out: { origin: string; prefs: SitePrefs }[] = [];
  for (const k of Object.keys(all)) {
    if (k.startsWith(STORAGE_PREFIX)) {
      out.push({ origin: k.slice(STORAGE_PREFIX.length), prefs: all[k] as SitePrefs });
    }
  }
  return out;
}
