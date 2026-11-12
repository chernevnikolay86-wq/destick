// Builds the unpacked MV3 bundle into dist/ using esbuild.
// Each entry is emitted as a self-contained IIFE (no ES-module loader),
// so the content script runs synchronously at document_start (startup contract).
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const srcDir = resolve(root, 'src');
const distDir = resolve(root, 'dist');
const dev = process.argv.includes('--dev');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// Ensure icons exist before copying.
if (!existsSync(resolve(srcDir, 'icons/icon16.png'))) {
  execFileSync(process.execPath, [resolve(here, 'gen-icons.mjs')], { stdio: 'inherit' });
}

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  platform: 'browser',
  legalComments: 'none',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: { content: resolve(srcDir, 'content/content.ts') },
  outfile: resolve(distDir, 'content.js'),
});
await build({
  ...common,
  entryPoints: { sw: resolve(srcDir, 'sw/service-worker.ts') },
  outfile: resolve(distDir, 'sw.js'),
});
await build({
  ...common,
  entryPoints: { options: resolve(srcDir, 'options/options.ts') },
  outfile: resolve(distDir, 'options.js'),
});

// Static assets.
cpSync(resolve(srcDir, 'manifest.json'), resolve(distDir, 'manifest.json'));
cpSync(resolve(srcDir, 'options/options.html'), resolve(distDir, 'options.html'));
cpSync(resolve(srcDir, 'icons'), resolve(distDir, 'icons'), { recursive: true });

console.log(`\n✔ built unpacked MV3 bundle → ${distDir}`);
