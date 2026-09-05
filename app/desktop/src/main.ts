// SchedBuddy 桌面壳：Electron 主进程
// 职责：内嵌启动 @schedbuddy/server（同一进程）→ 打开本机窗口加载 http://127.0.0.1:PORT
//       本机为唯一写端（回环地址），局域网浏览器仍只读（见 server/src/api.ts writeGuard）。
// 打包：electron-builder（--dir → win-unpacked 可运行目录）。数据写入用户数据目录。
import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

declare const __VERSION__: string;

let win: BrowserWindow | null = null;

async function boot(): Promise<void> {
  // 数据/静态目录解析（可被环境变量覆盖；打包后默认落在用户数据目录与 asar 内）
  const appPath = app.getAppPath();
  process.env.SCHEDBUDDY_DATA = process.env.SCHEDBUDDY_DATA || join(app.getPath('userData'), 'data');
  process.env.SCHEDBUDDY_WEB = process.env.SCHEDBUDDY_WEB || join(appPath, 'web', 'dist');
  const port = Number(process.env.SCHEDBUDDY_PORT || 3876);

  const serverEntry = join(appPath, 'server', 'dist', 'index.cjs');
  if (!existsSync(serverEntry)) {
    dialog.showErrorBox('SchedBuddy', `未找到后端入口：\n${serverEntry}\n\n请先执行 npm run build。`);
    app.quit();
    return;
  }

  try {
    // 内嵌启动后端（server 包导出 startServer；其 CJS 入口在 require.main===module 时才自动启动）
    const { startServer } = require(serverEntry) as typeof import('../../server/src/index');
    const srv = await startServer({ port, quiet: true });
    const url = srv.url;
    win = new BrowserWindow({
      width: 1180,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      title: `SchedBuddy v${typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev'}`,
      autoHideMenuBar: true,
      backgroundColor: '#F4F7FB',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.loadURL(url);
    win.on('closed', () => {
      win = null;
    });
  } catch (e) {
    dialog.showErrorBox('SchedBuddy 启动失败', e instanceof Error ? e.message : String(e));
    app.quit();
  }
}

// 单实例：重复启动时聚焦既有窗口
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
