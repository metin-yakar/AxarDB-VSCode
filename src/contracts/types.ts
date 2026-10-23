export type ServerId = string;

export interface ServerConfig {
  id: ServerId;
  name: string;
  url: string; // e.g. http://localhost:5000
  username: string;
  color?: string; // Hex color tag
  timeoutMs?: number;
  rejectUnauthorized?: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type CollectionKind = 'db' | 'system' | 'log' | 'memory' | 'bulk' | 'view' | 'trigger';

export const CATEGORY_ORDER: readonly CollectionKind[] = [
  'db',
  'system',
  'log',
  'memory',
  'bulk',
  'view',
  'trigger'
];

export interface CollectionInfo {
  name: string;
  kind: CollectionKind;
  count?: number;
  sizeKB?: number;
}

export interface CategoryInfo {
  kind: CollectionKind;
  label: string; // 'DB' | 'SYS' | 'LOG' | 'MEMORY' | 'BULK' | 'VIEW' | 'TRIGGER'
  items: CollectionInfo[];
  error?: string;
}

export type Doc = Record<string, unknown> & { _id?: string };

export interface QueryRequest {
  serverId: ServerId;
  script: string;
  params?: Record<string, string | number | boolean>;
  signal?: AbortSignal;
}

export interface QueryResult {
  ok: boolean;
  data?: unknown;
  docs?: Doc[];
  error?: {
    message: string;
    status?: number;
    detail?: string;
  };
  elapsedMs: number;
  script: string;
  executedAt: string;
}

export interface PageRequest {
  collection: string;
  kind: CollectionKind;
  filter?: string; // JS predicate body, e.g. "x => x.age > 3"
  sort?: {
    field: string;
    dir: 'asc' | 'desc';
  };
  skip: number;
  take: number;
}

export interface PageResult {
  docs: Doc[];
  total: number;
  skip: number;
  take: number;
  elapsedMs: number;
  script: string;
}

export type LogType = 'request' | 'error' | 'debug' | 'backup' | 'queue' | 'view' | 'trigger' | 'all';

export interface LogQuery {
  serverId: ServerId;
  type: LogType;
  collection?: string;
  take?: number;
  since?: string;
}

export interface HistoryEntry {
  id: string;
  serverId: ServerId;
  collection?: string;
  script: string;
  params?: Record<string, unknown>;
  executedAt: string;
  elapsedMs: number;
  ok: boolean;
  rowCount?: number;
  pinned?: boolean;
}

export type ExportFormat = 'json' | 'jsonl' | 'csv';

export type DataViewMode = 'grid' | 'json';

export type TemplateKind =
  | 'find'
  | 'findOne'
  | 'count'
  | 'insert'
  | 'update'
  | 'updateById'
  | 'delete'
  | 'deleteById';
