export type ServerId = string;

export interface ServerConfig {
  id: ServerId;
  name: string;
  url: string; // e.g. http://localhost:5000
  username: string;
  color?: string; // Hex color tag
  timeoutMs?: number;
  rejectUnauthorized?: boolean;
  isCloud?: boolean;
  subdomain?: string;
  expiresAt?: string;
  plan?: 'free' | 'paid';
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

// ---- Documentation ----
export type DocCategoryId =
  | 'getting-started'
  | 'javascript-api'
  | 'advanced'
  | 'http-security'
  | 'sdks-tools'
  | 'reference';

export type DocSearchFieldScope = 'all' | 'title' | 'code' | 'content';

export interface DocTableBlock {
  headers: string[];
  rows: string[][];
}

export interface DocCodeExample {
  title?: string;
  language: 'javascript' | 'csharp' | 'python' | 'bash';
  code: string;
  runnable?: boolean;
}

export interface DocCallout {
  kind: 'info' | 'warning';
  title: string;
  text: string;
}

export interface DocTopic {
  id: string;
  categoryId: DocCategoryId;
  title: string;
  icon: string;
  summary: string;
  keywords: string[];
  paragraphs?: string[];
  bullets?: string[];
  tables?: DocTableBlock[];
  codeExamples?: DocCodeExample[];
  callouts?: DocCallout[];
}

export interface DocCategory {
  id: DocCategoryId;
  title: string;
  icon: string;
  description: string;
  topics: DocTopic[];
}

// ---- AxarDB Cloud (https://axardb.com) ----
export interface CloudUser {
  id: string;
  email: string;
  plan: 'free' | 'paid';
  emailVerified?: boolean;
  balance?: number;
}

export interface CloudDatabaseStats {
  storageMb?: number;
  todayRequests?: number;
  totalRequests?: number;
  totalRequestLimit?: number;
}

export interface CloudDatabase {
  id: string;
  name: string;
  subdomain: string;
  status: 'active' | 'sleeping' | 'archived' | 'offline';
  is_accessible?: boolean;
  is_expired?: boolean;
  plan: 'free' | 'paid';
  plan_expires_at?: string | null;
  expires_at?: string | null;
  disk_limit_mb?: number;
  total_requests?: number;
  total_request_limit?: number;
  daily_request_limit?: number;
  created_at?: string;
  stats?: CloudDatabaseStats;
}

export interface CloudBotChallenge {
  challengeId: string;
  salt: string;
  difficulty: number;
  timestamp: number;
  signature: string;
}

export interface FastRegisterRequest {
  email: string;
  dbName: string;
  subdomain: string;
}

export interface FastRegisterResponse {
  success: boolean;
  message?: string;
  user: CloudUser;
  token: string;
  verificationLink?: string;
  database: CloudDatabase;
  apiKey: string;
}

export interface CloudProvisionedSession {
  dbId: string;
  dbName: string;
  subdomain: string;
  apiKey: string;
  createdAt: string;
  expiresAt: string;
  verificationLink?: string;
}

export interface CloudState {
  isLoggedIn: boolean;
  user: CloudUser | null;
  databases: CloudDatabase[];
  lastProvisioned: CloudProvisionedSession | null;
}
