import express from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { openStore, backupIfDue, type Store } from './db';
import { makeApi } from './api';

declare const __VERSION__: string;

export interface ServerOptions {
  dataDir?: string;
  webDir?: string;
  port?: number;
  host?: string;
  quiet?: boolean;
}

export interface RunningServer {
  store: Store;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export function lanIPv4(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return null;
}

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const cwd = process.cwd();
  const dataDir = resolve(opts.dataDir ?? process.env.SCHEDBUDDY_DATA ?? join(cwd, 'data'));
  const webDir = resolve(opts.webDir ?? process.env.SCHEDBUDDY_WEB ?? join(cwd, 'web', 'dist'));
  const port = opts.port ?? Number(process.env.SCHEDBUDDY_PORT || 3876);
  const host = opts.host ?? '0.0.0.0';

  const store = openStore(dataDir);
  const backed = backupIfDue(store, 14, 24);
  if (!opts.quiet && backed) console.log(`[schedbuddy] 自动备份: data/backups/${backed}`);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', makeApi(store));

  if (existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  await new Promise<void>((resolveListen) => {
    const server = app.listen(port, host, () => resolveListen());
    (app as any).locals.httpServer = server;
  });

  // 全局错误处理：记录并返回 JSON
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error('[api-error]', err?.stack ?? err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal', message: String(err?.message ?? err) });
  });

  const lan = lanIPv4();
  if (!opts.quiet) {
    const v = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
    console.log(`[schedbuddy] v${v} 已启动`);
    console.log(`[schedbuddy]   本机访问   http://127.0.0.1:${port}`);
    if (lan) console.log(`[schedbuddy]   局域网访问 http://${lan}:${port}  （只读）`);
    console.log(`[schedbuddy]   数据目录   ${dataDir}`);
  }

  const close = async () => {
    await new Promise<void>((ok) => (app as any).locals.httpServer.close(() => ok()));
    store.db.close();
  };

  return { store, port, url: `http://127.0.0.1:${port}`, close };
}

if (require.main === module) {
  startServer().catch((e) => {
    console.error('[schedbuddy] 启动失败:', e);
    process.exit(1);
  });
}
