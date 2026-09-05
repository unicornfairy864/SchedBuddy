// SchedBuddy 桌面壳：Electron 主进程
//
// 架构（避免 better-sqlite3 的 Node/Electron ABI 手动切换）：
//   后端始终由「系统 Node（打包时随包携带 node.exe）」作为子进程运行，
//   Electron 只负责窗口渲染 http://127.0.0.1:PORT —— 因此 better-sqlite3 只编译给系统 Node。
// 本机 = 唯一写端（回环）；局域网浏览器只读（见 server/src/api.ts writeGuard）。
import { app, BrowserWindow, dialog, session } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import http from 'node:http';

declare const __VERSION__: string;

// 本地/局域网程序：关闭 Electron HTTP 缓存（配合服务端 no-store），杜绝旧页面残留
app.commandLine.appendSwitch('disable-http-cache');

let win: BrowserWindow | null = null;
let serverProc: ChildProcess | null = null;

function serverEntryPath(): string {
  return join(app.getAppPath(), 'server', 'dist', 'index.cjs');
}

function nodeExecutable(): string {
  // 打包后：resources/node/node.exe（由 dist:dir 收尾脚本复制）；开发：直接走 PATH 的 node
  if (app.isPackaged) {
    const cand = join(process.resourcesPath, 'node', 'node.exe');
    if (existsSync(cand)) return cand;
  }
  return process.env.SCHEDBUDDY_NODE || 'node';
}

function waitServerReady(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/meta`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) return reject(new Error(`后端 ${timeoutMs / 1000}s 内未就绪`));
      setTimeout(ping, 300);
    };
    ping();
  });
}

async function boot(): Promise<void> {
  const port = Number(process.env.SCHEDBUDDY_PORT || 3876);
  const entry = serverEntryPath();
  if (!existsSync(entry)) {
    dialog.showErrorBox('SchedBuddy', `未找到后端入口：\n${entry}\n\n请先执行 npm run build。`);
    app.quit();
    return;
  }
  const nodeExe = nodeExecutable();

  try {
    // 拉起后端（系统 Node）
    serverProc = spawn(nodeExe, [entry], {
      env: {
        ...process.env,
        SCHEDBUDDY_DATA: process.env.SCHEDBUDDY_DATA || join(app.getPath('userData'), 'data'),
        SCHEDBUDDY_WEB: process.env.SCHEDBUDDY_WEB || join(app.getAppPath(), 'web', 'dist'),
        SCHEDBUDDY_PORT: String(port),
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    serverProc.on('exit', (code) => {
      if (!win) app.quit();
      else dialog.showErrorBox('SchedBuddy', `后端意外退出（code=${code}）`);
    });

    await waitServerReady(port);

    // 清理历史会话缓存：避免命中旧版本缓存页面（旧 index.html 可能被缓存最长 1h）
    try {
      await session.defaultSession.clearCache();
    } catch {
      /* 非致命 */
    }

    win = new BrowserWindow({
      width: 1180,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      title: `SchedBuddy v${typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'}`,
      autoHideMenuBar: true,
      backgroundColor: '#F4F7FB',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.loadURL(`http://127.0.0.1:${port}`);
    win.on('closed', () => {
      win = null;
    });
  } catch (e) {
    dialog.showErrorBox('SchedBuddy 启动失败', e instanceof Error ? e.message : String(e));
    serverProc?.kill();
    app.quit();
  }
}

app.on('before-quit', () => {
  try {
    serverProc?.kill();
  } catch {
    /* ignore */
  }
  serverProc = null;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(boot);
  app.on('window-all-closed', () => app.quit());
}
