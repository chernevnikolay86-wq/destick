// Suite 11 — release-check self-test (AC-B). The gate must pass a valid matrix
// and FAIL on every category of defect. 15 mandatory cases:
// R1, R2, R3, R4, R5a, R5b, R5c, R6, R7a, R7b, R7c, R8a1, R8a2, R8b1, R8b2.
import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = resolve(root, 'scripts/release-check.mjs');
const samplesDir = resolve(root, 'docs/samples');
const validPath = resolve(samplesDir, 'valid-matrix.json');

function run(path: string): number {
  const r = spawnSync(process.execPath, [script, path], { encoding: 'utf8' });
  return r.status ?? -1;
}

const tmpFiles: string[] = [];
function writeTmp(name: string, obj: unknown): string {
  const p = resolve(samplesDir, `_tmp-${name}.json`);
  writeFileSync(p, JSON.stringify(obj, null, 2));
  tmpFiles.push(p);
  return p;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clone(): any {
  return JSON.parse(readFileSync(validPath, 'utf8'));
}

afterEach(() => {
  while (tmpFiles.length) rmSync(tmpFiles.pop()!, { force: true });
});

describe('Suite 11 — release-check self-test (AC-B)', () => {
  it('R1 — fully valid matrix → exit 0', () => {
    expect(run(validPath)).toBe(0);
  });
  it('R2 — a PENDING functional → exit ≠0', () => {
    const d = clone();
    d.matrix[0].functional = 'PENDING';
    expect(run(writeTmp('r2', d))).not.toBe(0);
  });
  it('R3 — placeholder url ("example") → exit ≠0', () => {
    const d = clone();
    d.matrix[0].url = 'https://example.com/x';
    expect(run(writeTmp('r3', d))).not.toBe(0);
  });
  it('R4 — evidence path that does not exist → exit ≠0', () => {
    const d = clone();
    d.matrix[0].evidence = 'evidence/does-not-exist.txt';
    expect(run(writeTmp('r4', d))).not.toBe(0);
  });
  it('R5a — persistence survivesReload:false → exit ≠0', () => {
    const d = clone();
    d.persistence[0].survivesReload = false;
    expect(run(writeTmp('r5a', d))).not.toBe(0);
  });
  it('R5b — picker hidesAndRemembers:false → exit ≠0', () => {
    const d = clone();
    d.picker[0].hidesAndRemembers = false;
    expect(run(writeTmp('r5b', d))).not.toBe(0);
  });
  it('R5c — picker deleteResetWorks:false → exit ≠0', () => {
    const d = clone();
    d.picker[0].deleteResetWorks = false;
    expect(run(writeTmp('r5c', d))).not.toBe(0);
  });
  it('R6 — duplicate urls inflating the count → exit ≠0', () => {
    const d = clone();
    for (const row of d.matrix) row.url = 'https://edition.cnn.com/same';
    expect(run(writeTmp('r6', d))).not.toBe(0);
  });
  it('R7a — fewer than 10 matrix rows → exit ≠0', () => {
    const d = clone();
    d.matrix = d.matrix.slice(0, 9);
    expect(run(writeTmp('r7a', d))).not.toBe(0);
  });
  it('R7b — fewer than 3 persistence sites → exit ≠0', () => {
    const d = clone();
    d.persistence = d.persistence.slice(0, 2);
    expect(run(writeTmp('r7b', d))).not.toBe(0);
  });
  it('R7c — fewer than 2 picker sites → exit ≠0', () => {
    const d = clone();
    d.picker = d.picker.slice(0, 1);
    expect(run(writeTmp('r7c', d))).not.toBe(0);
  });
  it('R8a1 — chromeUiInputs section missing entirely → exit ≠0', () => {
    const d = clone();
    delete d.chromeUiInputs;
    expect(run(writeTmp('r8a1', d))).not.toBe(0);
  });
  it('R8a2 — chromeUiInputs present but incomplete (missing evidence) → exit ≠0', () => {
    const d = clone();
    delete d.chromeUiInputs.evidence;
    expect(run(writeTmp('r8a2', d))).not.toBe(0);
  });
  it('R8b1 — toolbarClick:false, osShortcut:true → exit ≠0', () => {
    const d = clone();
    d.chromeUiInputs.toolbarClick = false;
    d.chromeUiInputs.osShortcut = true;
    expect(run(writeTmp('r8b1', d))).not.toBe(0);
  });
  it('R8b2 — toolbarClick:true, osShortcut:false → exit ≠0', () => {
    const d = clone();
    d.chromeUiInputs.toolbarClick = true;
    d.chromeUiInputs.osShortcut = false;
    expect(run(writeTmp('r8b2', d))).not.toBe(0);
  });
  it('bonus — the real PENDING matrix fails the gate until filled', () => {
    expect(run(resolve(root, 'docs/site-matrix.json'))).not.toBe(0);
  });
});
