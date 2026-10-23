import * as vscode from 'vscode';
import {
  ServerId,
  ServerConfig,
  ConnectionState,
  CollectionInfo,
  CategoryInfo,
  Doc,
  QueryRequest,
  QueryResult,
  PageRequest,
  LogQuery,
  HistoryEntry,
  ExportFormat,
  TemplateKind,
  CollectionKind
} from './types.js';

export interface IAxarClient {
  query(req: QueryRequest): Promise<QueryResult>;
  listCategories(serverId: ServerId): Promise<CategoryInfo[]>;
  ping(serverId: ServerId): Promise<{ ok: boolean; elapsedMs: number; error?: string }>;
  dropCollection(serverId: ServerId, name: string): Promise<void>;
}

export interface IConnectionManager {
  readonly onDidChange: vscode.Event<void>;
  list(): ServerConfig[];
  get(id: ServerId): ServerConfig | undefined;
  add(cfg: Omit<ServerConfig, 'id'>, password: string): Promise<ServerConfig>;
  update(cfg: ServerConfig, password?: string): Promise<void>;
  remove(id: ServerId): Promise<void>;
  getCredentials(id: ServerId): Promise<{ username: string; password: string }>;
  state(id: ServerId): ConnectionState;
  connect(id: ServerId): Promise<void>;
  disconnect(id: ServerId): void;
}

export interface IQueryBuilder {
  page(req: PageRequest): { script: string; countScript: string; params: Record<string, unknown> };
  template(kind: TemplateKind, collection: string, ctx?: { doc?: Doc; kindOfStore?: CollectionKind }): string;
  insert(collection: string, doc: Doc): string;
  updateById(collection: string, id: string, patch: Doc): { script: string; params: { id: string } };
  replaceById(collection: string, id: string, doc: Doc): { script: string; params: { id: string } };
  deleteById(collection: string, id: string): { script: string; params: { id: string } };
  logs(q: LogQuery): { script: string; params: Record<string, unknown> };
}

export interface IHistoryStore {
  readonly onDidChange: vscode.Event<ServerId>;
  add(e: Omit<HistoryEntry, 'id'>): Promise<HistoryEntry>;
  list(serverId: ServerId, opts?: { collection?: string; search?: string; limit?: number }): HistoryEntry[];
  pin(id: string, pinned: boolean): Promise<void>;
  remove(id: string): Promise<void>;
  clear(serverId: ServerId): Promise<void>;
}

export interface IExportService {
  exportDocs(docs: Doc[], format: ExportFormat, suggestedName: string): Promise<vscode.Uri | undefined>;
  exportCollection(
    serverId: ServerId,
    collection: string,
    format: ExportFormat,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.Uri | undefined>;
}

export interface ILogService {
  fetch(q: LogQuery): Promise<QueryResult>;
}
