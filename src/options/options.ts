// Options page (§Picker Options chooser, §State model). Vanilla TS, no framework.
import { getPrefs, setAutoClean, deleteRule, resetSite, setPrefs, listOrigins } from '../core/storage';
import type { OptionsToSw, RegistryEntry } from '../core/messages';
import { DEFAULT_PREFS } from '../core/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function toast(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1600);
}

async function sw<T>(msg: OptionsToSw): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T;
  } catch {
    return undefined;
  }
}

/* ------------------------------- picker -------------------------------- */
let registry: RegistryEntry[] = [];

async function refreshPicker(): Promise<void> {
  registry = (await sw<RegistryEntry[]>({ ks: 'getRegistry' })) ?? [];
  const sel = $('pickTab') as HTMLSelectElement;
  sel.innerHTML = '';
  if (registry.length === 0) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '(no open web pages found — open one first)';
    sel.appendChild(o);
    return;
  }
  for (const e of registry) {
    const o = document.createElement('option');
    o.value = `${e.tabId}:${e.windowId}`;
    o.textContent = e.origin;
    sel.appendChild(o);
  }
}

$('pickBtn').addEventListener('click', async () => {
  const sel = $('pickTab') as HTMLSelectElement;
  if (!sel.value) {
    toast('Open a normal web page first.');
    return;
  }
  const [tabId, windowId] = sel.value.split(':').map(Number);
  const res = await sw<{ ok: boolean }>({ ks: 'focusAndPick', tabId, windowId });
  if (res?.ok) toast('Picker started on the page — hover and click the element.');
  else toast('That tab is no longer available.');
});

/* -------------------------------- sites -------------------------------- */
async function renderSites(): Promise<void> {
  const container = $('sites');
  const origins = await listOrigins();
  // merge with currently-open origins so you can toggle auto-clean before first clean
  for (const e of registry) {
    if (!origins.some((o) => o.origin === e.origin)) {
      origins.push({ origin: e.origin, prefs: { ...DEFAULT_PREFS, pickedRules: [] } });
    }
  }
  origins.sort((a, b) => a.origin.localeCompare(b.origin));

  if (origins.length === 0) {
    container.innerHTML = '<p class="note">No per-site settings yet. Clean a page or add one below.</p>';
    return;
  }
  container.innerHTML = '';
  for (const { origin } of origins) {
    const prefs = await getPrefs(origin);
    const site = document.createElement('div');
    site.className = 'site';

    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'origin';
    name.textContent = origin;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '12px';
    controls.style.alignItems = 'center';

    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = prefs.autoClean;
    cb.addEventListener('change', async () => {
      try {
        await setAutoClean(origin, cb.checked);
        toast(cb.checked ? 'Auto-clean on for ' + origin : 'Auto-clean off');
      } catch {
        cb.checked = !cb.checked; // revert the control to match the unchanged stored state
        toast('Could not save — storage error.');
      }
    });
    sw.appendChild(cb);
    sw.appendChild(document.createTextNode('Auto-clean on load'));

    const reset = document.createElement('button');
    reset.className = 'link';
    reset.textContent = 'Reset site';
    reset.addEventListener('click', async () => {
      try {
        await resetSite(origin);
        toast('Reset ' + origin);
        await renderSites();
      } catch {
        toast('Could not reset — storage error.');
      }
    });

    controls.appendChild(sw);
    controls.appendChild(reset);
    row.appendChild(name);
    row.appendChild(controls);
    site.appendChild(row);

    if (prefs.pickedRules.length) {
      const ul = document.createElement('ul');
      ul.className = 'rules';
      prefs.pickedRules.forEach((rule, i) => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'mono';
        label.textContent =
          (rule.hostChain.length ? rule.hostChain.join(' › ') + ' › ' : '') + rule.selector;
        const del = document.createElement('button');
        del.className = 'link';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          try {
            await deleteRule(origin, i);
            toast('Rule deleted');
            await renderSites();
          } catch {
            toast('Could not delete — storage error.');
          }
        });
        li.appendChild(label);
        li.appendChild(del);
        ul.appendChild(li);
      });
      site.appendChild(ul);
    }
    container.appendChild(site);
  }
}

$('addBtn').addEventListener('click', async () => {
  const input = $('addOrigin') as HTMLInputElement;
  let origin = input.value.trim();
  if (!origin) return;
  try {
    origin = new URL(origin).origin;
  } catch {
    toast('Enter a full URL, e.g. https://example.com');
    return;
  }
  try {
    const prefs = await getPrefs(origin);
    prefs.autoClean = true;
    await setPrefs(origin, prefs);
    input.value = '';
    toast('Added ' + origin);
    await renderSites();
  } catch {
    toast('Could not save — storage error.');
  }
});

/* -------------------------------- init --------------------------------- */
(async () => {
  await refreshPicker();
  await renderSites();
})();
