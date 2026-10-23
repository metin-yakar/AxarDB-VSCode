import * as http from 'http';

export interface MockServerOptions {
  port?: number;
  user?: string;
  pass?: string;
}

export class MockAxarServer {
  private server: http.Server | undefined;
  public port: number;
  public user: string;
  public pass: string;

  // In-memory collections matching image distribution:
  // DB: 34 collections
  // SYS: 4 collections (sysusers, sysqueue, sysvaults, sysconfig)
  // LOG: 1 collection (syslogs)
  // MEMORY: 1 collection
  // BULK: 18 collections
  // VIEW: 2 views
  // TRIGGER: 2 triggers
  public dbCollections: Map<string, Array<Record<string, unknown>>> = new Map();
  public memoryCollections: Array<{ name: string; count: number }> = [
    { name: 'active_sessions', count: 42 }
  ];
  public bulkCollections: Array<{ name: string; file: string; recordCount: number; sizeKB: number }> = [];
  public views: string[] = ['activeUsers', 'recentOrders'];
  public triggers: string[] = ['onUserCreated', 'auditLogTrigger'];

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 5599;
    this.user = options.user ?? 'admin';
    this.pass = options.pass ?? 'admin123';

    this.initializeData();
  }

  private initializeData(): void {
    // 34 regular DB collections
    for (let i = 1; i <= 34; i++) {
      const colName = `col_${i.toString().padStart(2, '0')}`;
      this.dbCollections.set(colName, [
        { _id: `id_1_${colName}`, name: `Item 1 for ${colName}`, age: 20 + i, active: true },
        { _id: `id_2_${colName}`, name: `Item 2 for ${colName}`, age: 30 + i, active: false }
      ]);
    }

    // SYS collections
    this.dbCollections.set('sysusers', [
      { _id: 'sys_1', username: 'admin', role: 'root' },
      { _id: 'sys_2', username: 'viewer', role: 'read' }
    ]);
    this.dbCollections.set('sysqueue', [
      { _id: 'q_1', task: 'backup_sync', status: 'completed' }
    ]);
    this.dbCollections.set('sysvaults', [
      { _id: 'v_1', key: 'STRIPE_API_KEY', masked: 'true' }
    ]);
    this.dbCollections.set('sysconfig', [
      { _id: 'cfg_1', memoryLimitPercentage: 0.4, queryTimeoutMinutes: 10 }
    ]);

    // 18 Bulk collections
    for (let i = 1; i <= 18; i++) {
      const bName = `bulk_dataset_${i.toString().padStart(2, '0')}`;
      this.bulkCollections.push({
        name: bName,
        file: `${bName}.jsonl`,
        recordCount: 5000 + i * 100,
        sizeKB: 250.5 + i * 10
      });
    }
  }

  public async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        resolve(`http://localhost:${this.port}`);
      });

      this.server.on('error', err => {
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private checkAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="AxarDB"',
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return false;
    }

    const encoded = authHeader.substring(6);
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [u, p] = decoded.split(':');

    if (u !== this.user || p !== this.pass) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="AxarDB"',
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ error: 'Invalid credentials' }));
      return false;
    }

    return true;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);

    // Allow CORS if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!this.checkAuth(req, res)) {
      return;
    }

    if (url.pathname === '/metrics' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', memoryUsageMb: 120, uptimeSeconds: 3600 }));
      return;
    }

    if (url.pathname === '/collections' && req.method === 'GET') {
      // Returns list of collection names: 34 db collections + 4 sys collections + syslogs
      const names = [
        ...Array.from(this.dbCollections.keys()),
        'syslogs'
      ].sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(names));
      return;
    }

    if (url.pathname.startsWith('/collections/') && req.method === 'DELETE') {
      const colName = url.pathname.replace('/collections/', '');
      this.dbCollections.delete(colName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (url.pathname === '/memory/list' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.memoryCollections));
      return;
    }

    if (url.pathname === '/bulk/list' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.bulkCollections));
      return;
    }

    if (url.pathname === '/query' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        this.handleQuery(body, url.searchParams, res);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Not found: ${url.pathname}` }));
  }

  private handleQuery(script: string, queryParams: URLSearchParams, res: http.ServerResponse): void {
    const trimmed = script.trim();

    // Check for view/trigger listing scripts
    if (trimmed.includes('db.listViews()') || trimmed.includes('listViews()')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.views));
      return;
    }
    if (trimmed.includes('db.listTriggers()') || trimmed.includes('listTriggers()')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.triggers));
      return;
    }

    // Check count query: db.<col>.count()
    const countMatch = trimmed.match(/db\.([A-Za-z0-9_]+)\.count\(\)/);
    if (countMatch && countMatch[1]) {
      const col = countMatch[1];
      const items = this.dbCollections.get(col) ?? [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(items.length));
      return;
    }

    // Check syslogs queries: db.syslogs...
    if (trimmed.includes('db.syslogs') || trimmed.includes('log.request') || trimmed.includes('log.error')) {
      const sampleLogs = [
        {
          _id: '018dc335-0001-7000-8000-000000000001',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 23),
          type: 'request',
          ip: '127.0.0.1',
          user: this.user,
          query: 'db.users.findall().take(10)',
          durationMs: 1.2,
          status: 'Success'
        },
        {
          _id: '018dc335-0002-7000-8000-000000000002',
          timestamp: new Date(Date.now() - 5000).toISOString().replace('T', ' ').substring(0, 23),
          type: 'error',
          ip: '127.0.0.1',
          user: this.user,
          query: 'db.unknown.findall()',
          durationMs: 0.8,
          status: 'Failed: Collection not found'
        }
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sampleLogs));
      return;
    }

    // Check insert: db.<col>.insert(...)
    const insertMatch = trimmed.match(/db\.([A-Za-z0-9_]+)\.insert\((.*)\)/s);
    if (insertMatch && insertMatch[1]) {
      const col = insertMatch[1];
      let doc: Record<string, unknown> = {};
      try {
        // Simple eval/parse of inserted document
        const jsonStr = insertMatch[2]?.trim() ?? '{}';
        doc = JSON.parse(jsonStr);
      } catch {
        doc = { note: 'parsed_fallback', raw: insertMatch[2] };
      }
      if (!doc._id) {
        doc._id = `gen_${Date.now()}`;
      }
      const existing = this.dbCollections.get(col) ?? [];
      existing.push(doc);
      this.dbCollections.set(col, existing);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(doc));
      return;
    }

    // Check updateById: db.<col>.update(x => x._id == @id, ...)
    const updateMatch = trimmed.match(/db\.([A-Za-z0-9_]+)\.update\(.*@id\s*,\s*(\{.*\})\)/s);
    if (updateMatch && updateMatch[1]) {
      const col = updateMatch[1];
      const targetId = queryParams.get('id') ?? '';
      const items = this.dbCollections.get(col) ?? [];
      const item = items.find(x => x._id === targetId);
      if (item && updateMatch[2]) {
        try {
          const patch = JSON.parse(updateMatch[2]);
          Object.assign(item, patch);
        } catch {
          // Ignore
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ updated: 1 }));
      return;
    }

    // Check delete: db.<col>.delete(x => x._id == @id)
    const deleteMatch = trimmed.match(/db\.([A-Za-z0-9_]+)\.delete\(.*@id\)/);
    if (deleteMatch && deleteMatch[1]) {
      const col = deleteMatch[1];
      const targetId = queryParams.get('id') ?? '';
      let items = this.dbCollections.get(col) ?? [];
      items = items.filter(x => x._id !== targetId);
      this.dbCollections.set(col, items);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: 1 }));
      return;
    }

    // Check findall / pagination queries: db.<col>.findall()
    const findallMatch = trimmed.match(/db\.([A-Za-z0-9_]+)\.findall/);
    if (findallMatch && findallMatch[1]) {
      const col = findallMatch[1];
      const items = this.dbCollections.get(col) ?? [];
      const skip = parseInt(queryParams.get('__skip') ?? '0', 10);
      const take = parseInt(queryParams.get('__take') ?? '50', 10);
      const paged = items.slice(skip, skip + take);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paged));
      return;
    }

    // Default: return generic array or status
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ message: 'Query executed successfully', script: trimmed }]));
  }
}
