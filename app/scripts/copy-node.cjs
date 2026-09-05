// dist:dir 收尾：把系统 Node（node.exe）复制进打包产物，供桌面壳以子进程拉起后端。
// 使 better-sqlite3 永远只编译给系统 Node，无需 Electron/Node ABI 手动切换。
const fs = require('node:fs');
const path = require('node:path');

const outDir = path.resolve(__dirname, '../desktop/release/win-unpacked/resources/node');
const src = process.env.SCHEDBUDDY_NODE || process.execPath;
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, path.join(outDir, 'node.exe'));
console.log('[copy-node] node.exe ->', path.join(outDir, 'node.exe'));
