import {
  IAxarClient,
} from '../contracts/services.js';
import {
  ServerId,
  QueryRequest,
  QueryResult,
  CategoryInfo,
  CollectionInfo,
  CollectionKind,
  CATEGORY_ORDER,
  Doc
} from '../contracts/types.js';
import { AuthError, ConnectionError, QueryError } from './errors.js';
import { Logger } from '../util/logger.js';

export interface CredentialsProvider {
  (serverId: ServerId): Promise<{
    url: string;
    username: string;
    password: string;
    timeoutMs?: number;
  }>;
}

/**
 * Pure helper function to classify a raw list of collection names
 * into DB, SYS, and LOG categories.
 */
export function classifyCollections(names: string[]): {
  db: CollectionInfo[];
  system: CollectionInfo[];
  log: CollectionInfo[];
} {
  const db: CollectionInfo[] = [];
  const system: CollectionInfo[] = [];
  const log: CollectionInfo[] = [];

  for (const name of names) {
    if (name.toLowerCase() === 'syslogs') {
      log.push({ name, kind: 'log' });
    } else if (name.toLowerCase().startsWith('sys')) {
      system.push({ name, kind: 'system' });
    } else {
      db.push({ name, kind: 'db' });
    }
  }

  // Sort alphabetically
  const sorter = (a: CollectionInfo, b: CollectionInfo) => a.name.localeCompare(b.name);
  db.sort(sorter);
  system.sort(sorter);
  log.sort(sorter);

  return { db, system, log };
}

export class AxarClient implements IAxarClient {
  constructor(private readonly getCredentials: CredentialsProvider) {}

  public async query(req: QueryRequest): Promise<QueryResult> {
    const creds = await this.getCredentials(req.serverId);
    const timeout = creds.timeoutMs ?? 30000;
    const controller = new AbortController();

    let timeoutId: NodeJS.Timeout | undefined;
    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(new Error(`Query timed out after ${timeout}ms`)), timeout);
    }

    if (req.signal) {
      req.signal.addEventListener('abort', () => controller.abort(req.signal?.reason));
    }

    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    const start = performance.now();
    const executedAt = new Date().toISOString();

    // Construct URL with query parameters for @param injection
    const targetUrl = new URL('/query', creds.url);
    if (req.params) {
      for (const [key, val] of Object.entries(req.params)) {
        if (val !== undefined && val !== null) {
          targetUrl.searchParams.set(key, String(val));
        }
      }
    }

    try {
      const res = await fetch(targetUrl.toString(), {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: req.script,
        signal: controller.signal,
      });

      const elapsedMs = Math.round(performance.now() - start);

      if (!res.ok) {
        let errDetail = '';
        try {
          const bodyJson = (await res.json()) as Record<string, unknown>;
          errDetail = (bodyJson.detail as string) || (bodyJson.error as string) || (bodyJson.title as string) || JSON.stringify(bodyJson);
        } catch {
          errDetail = await res.text().catch(() => '');
        }

        if (res.status === 401) {
          throw new AuthError(`Authentication failed for server: ${creds.url}`, res.status);
        }

        throw new QueryError(`Query failed with status ${res.status}: ${errDetail}`, res.status, errDetail);
      }

      let data: unknown;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      let docs: Doc[] | undefined;
      if (Array.isArray(data)) {
        if (data.length === 0 || (typeof data[0] === 'object' && data[0] !== null)) {
          docs = data as Doc[];
        }
      }

      return {
        ok: true,
        data,
        docs,
        elapsedMs,
        script: req.script,
        executedAt,
      };
    } catch (err: unknown) {
      const elapsedMs = Math.round(performance.now() - start);
      if (err instanceof AuthError || err instanceof QueryError) {
        return {
          ok: false,
          error: {
            message: err.message,
            status: err.status,
            detail: err.detail,
          },
          elapsedMs,
          script: req.script,
          executedAt,
        };
      }

      const isAbort = (err as Error)?.name === 'AbortError' || controller.signal.aborted;
      const msg = isAbort ? `Query was aborted / timed out after ${timeout}ms` : `Connection error: ${(err as Error)?.message || String(err)}`;

      Logger.error(`AxarClient query error [${creds.url}]`, err);

      return {
        ok: false,
        error: {
          message: msg,
          detail: String(err),
        },
        elapsedMs,
        script: req.script,
        executedAt,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  public async ping(serverId: ServerId): Promise<{ ok: boolean; elapsedMs: number; error?: string }> {
    const creds = await this.getCredentials(serverId);
    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    const start = performance.now();

    try {
      const targetUrl = new URL('/metrics', creds.url);
      const res = await fetch(targetUrl.toString(), {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(creds.timeoutMs ?? 10000),
      });

      const elapsedMs = Math.round(performance.now() - start);
      if (res.ok) {
        return { ok: true, elapsedMs };
      }
      return { ok: false, elapsedMs, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - start);
      return { ok: false, elapsedMs, error: (err as Error).message || String(err) };
    }
  }

  public async dropCollection(serverId: ServerId, name: string): Promise<void> {
    const creds = await this.getCredentials(serverId);
    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
    const targetUrl = new URL(`/collections/${encodeURIComponent(name)}`, creds.url);

    const res = await fetch(targetUrl.toString(), {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      throw new QueryError(`Failed to drop collection '${name}': HTTP ${res.status}`, res.status);
    }
  }

  public async listCategories(serverId: ServerId): Promise<CategoryInfo[]> {
    const creds = await this.getCredentials(serverId);
    const authHeader = 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`).toString('base64');

    // Run all 5 sources concurrently
    const [collectionsRes, memoryRes, bulkRes, viewsRes, triggersRes] = await Promise.allSettled([
      // 1. /collections (DB, SYS, LOG)
      fetch(new URL('/collections', creds.url).toString(), {
        headers: { Authorization: authHeader },
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as string[];
      }),

      // 2. /memory/list
      fetch(new URL('/memory/list', creds.url).toString(), {
        headers: { Authorization: authHeader },
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Array<{ name: string; count: number }>;
      }),

      // 3. /bulk/list
      fetch(new URL('/bulk/list', creds.url).toString(), {
        headers: { Authorization: authHeader },
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Array<{ name: string; file: string; recordCount: number; sizeKB: number }>;
      }),

      // 4. db.listViews()
      this.query({ serverId, script: 'db.listViews()' }).then(q => {
        if (!q.ok) throw new Error(q.error?.message ?? 'Failed to list views');
        return Array.isArray(q.data) ? (q.data as string[]) : [];
      }),

      // 5. db.listTriggers()
      this.query({ serverId, script: 'db.listTriggers()' }).then(q => {
        if (!q.ok) throw new Error(q.error?.message ?? 'Failed to list triggers');
        return Array.isArray(q.data) ? (q.data as string[]) : [];
      }),
    ]);

    const resultCategories: CategoryInfo[] = [];

    // Category: DB, SYS, LOG (derived from /collections)
    let dbItems: CollectionInfo[] = [];
    let sysItems: CollectionInfo[] = [];
    let logItems: CollectionInfo[] = [];
    let colError: string | undefined;

    if (collectionsRes.status === 'fulfilled') {
      const classified = classifyCollections(collectionsRes.value);
      dbItems = classified.db;
      sysItems = classified.system;
      logItems = classified.log;
    } else {
      colError = collectionsRes.reason?.message || 'Failed to fetch collections';
    }

    // 1. DB
    resultCategories.push({
      kind: 'db',
      label: 'DB',
      items: dbItems,
      error: colError,
    });

    // 2. SYS
    resultCategories.push({
      kind: 'system',
      label: 'SYS',
      items: sysItems,
      error: colError,
    });

    // 3. LOG
    resultCategories.push({
      kind: 'log',
      label: 'LOG',
      items: logItems,
      error: colError,
    });

    // 4. MEMORY
    if (memoryRes.status === 'fulfilled') {
      const items: CollectionInfo[] = memoryRes.value.map(m => ({
        name: m.name,
        kind: 'memory' as const,
        count: m.count,
      })).sort((a, b) => a.name.localeCompare(b.name));
      resultCategories.push({ kind: 'memory', label: 'MEMORY', items });
    } else {
      resultCategories.push({
        kind: 'memory',
        label: 'MEMORY',
        items: [],
        error: memoryRes.reason?.message || 'Failed to fetch memory collections',
      });
    }

    // 5. BULK
    if (bulkRes.status === 'fulfilled') {
      const items: CollectionInfo[] = bulkRes.value.map(b => ({
        name: b.name,
        kind: 'bulk' as const,
        count: b.recordCount,
        sizeKB: b.sizeKB,
      })).sort((a, b) => a.name.localeCompare(b.name));
      resultCategories.push({ kind: 'bulk', label: 'BULK', items });
    } else {
      resultCategories.push({
        kind: 'bulk',
        label: 'BULK',
        items: [],
        error: bulkRes.reason?.message || 'Failed to fetch bulk collections',
      });
    }

    // 6. VIEW
    if (viewsRes.status === 'fulfilled') {
      const items: CollectionInfo[] = viewsRes.value.map(v => ({
        name: v,
        kind: 'view' as const,
      })).sort((a, b) => a.name.localeCompare(b.name));
      resultCategories.push({ kind: 'view', label: 'VIEW', items });
    } else {
      resultCategories.push({
        kind: 'view',
        label: 'VIEW',
        items: [],
        error: viewsRes.reason?.message || 'Failed to fetch views',
      });
    }

    // 7. TRIGGER
    if (triggersRes.status === 'fulfilled') {
      const items: CollectionInfo[] = triggersRes.value.map(t => ({
        name: t,
        kind: 'trigger' as const,
      })).sort((a, b) => a.name.localeCompare(b.name));
      resultCategories.push({ kind: 'trigger', label: 'TRIGGER', items });
    } else {
      resultCategories.push({
        kind: 'trigger',
        label: 'TRIGGER',
        items: [],
        error: triggersRes.reason?.message || 'Failed to fetch triggers',
      });
    }

    // Ensure CATEGORY_ORDER sequence
    return CATEGORY_ORDER.map(k => resultCategories.find(c => c.kind === k)!);
  }
}
