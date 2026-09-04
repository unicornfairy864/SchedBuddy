// 统一构建脚本：esbuild 打包 shared / server / desktop（web 走 Vite）。
// 用法: node scripts/build.mjs [shared|server|desktop]   缺省 = shared+server
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['shared', 'server'];
const common = { bundle: true, logLevel: 'info', sourcemap: true, define: { __VERSION__: JSON.stringify(VERSION) } };

async function buildShared() {
  await build({
    ...common,
    entryPoints: [join(root, 'shared/src/index.ts')],
    outfile: join(root, 'shared/dist/index.cjs'),
    platform: 'neutral', // 同时兼容浏览器与 Node 使用方的纯逻辑
    format: 'cjs',
    target: ['es2020'],
  });
}

async function buildServer() {
  await build({
    ...common,
    entryPoints: [join(root, 'server/src/index.ts')],
    outfile: join(root, 'server/dist/index.cjs'),
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    external: ['better-sqlite3', 'express'],
    banner: { js: '/* SchedBuddy server */' },
  });
}

async function buildDesktop() {
  await build({
    ...common,
    entryPoints: [join(root, 'desktop/src/main.ts')],
    outfile: join(root, 'desktop/dist/main.cjs'),
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    external: ['electron', 'better-sqlite3', 'express'],
  });
}

const jobs = [];
if (targets.includes('shared')) jobs.push(buildShared());
if (targets.includes('server')) jobs.push(buildServer());
if (targets.includes('desktop')) jobs.push(buildDesktop());
await Promise.all(jobs);
console.log('[build.mjs] done for:', targets.join(', '));
