#!/usr/bin/env node
// Enforceable publication gate (AC-B release-check). Reads a site-matrix JSON,
// validates required fields + on-disk evidence, and exits non-zero on any gap.
// Usage: node scripts/release-check.mjs [path-to-site-matrix.json]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const matrixPath = resolve(process.argv[2] ?? resolve(here, '../docs/site-matrix.json'));

const errors = [];
const fail = (m) => errors.push(m);

function isPlaceholderUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return true;
  const u = url.toLowerCase();
  return u.includes('example') || u.includes('конкретна') || u.includes('<');
}

function evidenceOk(ev) {
  if (ev === 'PENDING' || typeof ev !== 'string' || ev.trim() === '') return false;
  return existsSync(resolve(dirname(matrixPath), ev));
}

let data;
try {
  data = JSON.parse(readFileSync(matrixPath, 'utf8'));
} catch (e) {
  console.error(`release-check: cannot read/parse ${matrixPath}: ${e.message}`);
  process.exit(2);
}

const matrix = Array.isArray(data.matrix) ? data.matrix : [];
const persistence = Array.isArray(data.persistence) ? data.persistence : [];
const picker = Array.isArray(data.picker) ? data.picker : [];
const chromeUiInputs = data.chromeUiInputs;

// ---- matrix rows ----
const seenUrls = new Set();
for (const [i, row] of matrix.entries()) {
  const tag = `matrix[${i}]`;
  if (isPlaceholderUrl(row.url)) fail(`${tag}: placeholder/empty url (${row.url ?? '∅'})`);
  else seenUrls.add(row.url.trim());
  if (row.functional === 'PENDING') fail(`${tag}: functional is PENDING`);
  else if (row.functional === 'fail') fail(`${tag}: functional=fail`);
  else if (row.functional !== 'pass') fail(`${tag}: functional must be pass|fail|PENDING`);
  if (!evidenceOk(row.evidence)) fail(`${tag}: missing/PENDING evidence (${row.evidence ?? '∅'})`);
  for (const f of ['category', 'browser', 'viewport', 'consent', 'steps']) {
    if (row[f] === undefined || row[f] === null || row[f] === '') fail(`${tag}: missing field "${f}"`);
  }
  if (!Array.isArray(row.expectedHides)) fail(`${tag}: expectedHides must be an array`);
}
if (seenUrls.size < 10) fail(`matrix: need ≥10 rows with DISTINCT urls, got ${seenUrls.size}`);

// negative controls scored separately but must still have a recorded result
const negatives = matrix.filter((r) => r.negativeControl === true);
for (const [i, r] of negatives.entries()) {
  if (r.functional === 'PENDING') fail(`negativeControl[${i}]: result is PENDING`);
}

// ---- persistence (≥3 distinct) ----
const persistSites = new Set();
for (const [i, row] of persistence.entries()) {
  const tag = `persistence[${i}]`;
  if (!row.site || isPlaceholderUrl(row.site)) fail(`${tag}: placeholder/empty site`);
  else persistSites.add(row.site.trim());
  if (row.survivesReload !== true) fail(`${tag}: survivesReload must be true`);
  if (!evidenceOk(row.evidence)) fail(`${tag}: missing evidence`);
}
if (persistSites.size < 3) fail(`persistence: need ≥3 distinct sites, got ${persistSites.size}`);

// ---- picker (≥2 distinct) ----
const pickerSites = new Set();
for (const [i, row] of picker.entries()) {
  const tag = `picker[${i}]`;
  if (!row.site || isPlaceholderUrl(row.site)) fail(`${tag}: placeholder/empty site`);
  else pickerSites.add(row.site.trim());
  if (row.hidesAndRemembers !== true) fail(`${tag}: hidesAndRemembers must be true`);
  if (row.deleteResetWorks !== true) fail(`${tag}: deleteResetWorks must be true`);
  if (!evidenceOk(row.evidence)) fail(`${tag}: missing evidence`);
}
if (pickerSites.size < 2) fail(`picker: need ≥2 distinct sites, got ${pickerSites.size}`);

// ---- chromeUiInputs (AC-B4) ----
if (!chromeUiInputs || typeof chromeUiInputs !== 'object') {
  fail('chromeUiInputs: missing (AC-B4 real toolbar + OS shortcut)');
} else {
  if (chromeUiInputs.toolbarClick !== true) fail('chromeUiInputs.toolbarClick must be true');
  if (chromeUiInputs.osShortcut !== true) fail('chromeUiInputs.osShortcut must be true');
  if (!evidenceOk(chromeUiInputs.evidence)) fail('chromeUiInputs: missing evidence');
}

if (errors.length) {
  console.error(`✖ release-check FAILED (${errors.length}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✔ release-check passed — publication gate clear.');
process.exit(0);
