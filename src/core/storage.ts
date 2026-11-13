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
    if (!v) return { ...DEFAULT_PREFS, pickedRules: [], preHideSelectors: [] };
    return {
      autoClean: !!v.autoClean,
      pickedRules: Array.isArray(v.pickedRules) ? v.pickedRules : [],
      preHideSelectors: Array.isArray(v.preHideSelectors) ? v.preHideSelectors : [],
    };
  } catch {
    return { ...DEFAULT_PREFS, pickedRules: [], preHideSelectors: [] };
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
  if (!v) return { ...DEFAULT_PREFS, pickedRules: [], preHideSelectors: [] };
  return {
    autoClean: !!v.autoClean,
    pickedRules: Array.isArray(v.pickedRules) ? v.pickedRules : [],
    preHideSelectors: Array.isArray(v.preHideSelectors) ? v.preHideSelectors : [],
  };
}

export async function setAutoClean(origin: string, autoClean: boolean): Promise<void> {
  const p = await readPrefsStrict(origin); // a read failure aborts, never writes []
  p.autoClean = autoClean;
  await setPrefs(origin, p);
}

const PRE_HIDE_CAP = 40;

/**
 * Persist the sticky clean-state AND the pre-paint hint together (§flash). CLEAN stores
 * autoClean=true plus the hidden-junk selectors; UNDO clears both. Strict read first so a
 * transient storage error aborts instead of clobbering the user's saved rules.
 */
export async function setCleanState(
  origin: string,
  cleaned: boolean,
  preHideSelectors: string[],
): Promise<void> {
  const p = await readPrefsStrict(origin);
  p.autoClean = cleaned;
  p.preHideSelectors = cleaned ? preHideSelectors.slice(0, PRE_HIDE_CAP) : [];
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
  // §State model: reset-site clears rules AND turns autoClean off (and the pre-hide hint).
  await setPrefs(origin, { autoClean: false, pickedRules: [], preHideSelectors: [] });
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
