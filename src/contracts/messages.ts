import {
  ServerId,
  ServerConfig,
  ConnectionState,
  CollectionKind,
  CategoryInfo,
  Doc,
  PageRequest,
  PageResult,
  QueryResult,
  HistoryEntry,
  ExportFormat,
  DataViewMode,
  CloudState,
  CloudBotChallenge
} from './types.js';

// ---- Connections webview ----
export type ConnToHost =
  | { type: 'ready' }
  | { type: 'expand'; serverId: ServerId }
  | { type: 'toggleCategory'; serverId: ServerId; kind: CollectionKind; expanded: boolean }
  | { type: 'refresh'; serverId?: ServerId; kind?: CollectionKind }
  | { type: 'openCollection'; serverId: ServerId; collection: string; kind: CollectionKind }
  | { type: 'addServer' }
  | { type: 'openCloud' }
  | { type: 'connect' | 'disconnect'; serverId: ServerId }
  | { type: 'filterChanged'; text: string }
  | { type: 'contextAction'; command: string; arg?: Record<string, unknown> };

export type HostToConn =
  | {
      type: 'state';
      servers: Array<
        ServerConfig & {
          state: ConnectionState;
          categories?: CategoryInfo[];
          error?: string;
        }
      >;
      filter: string;
      visibleCategories: CollectionKind[];
    }
  | { type: 'categoryUpdate'; serverId: ServerId; category: CategoryInfo }
  | { type: 'focusFilter' };

// ---- Data panel webview ----
export type PanelToHost =
  | { type: 'ready' }
  | { type: 'loadPage'; req: Omit<PageRequest, 'collection' | 'kind'> }
  | { type: 'runQuery'; script: string }
  | { type: 'cellEdit'; rowIndex: number; field: string; value: unknown; oldValue: unknown }
  | { type: 'saveDoc'; rowIndex: number | null; doc: Doc } // null => insert
  | { type: 'requestHistory' }
  | { type: 'pickHistory'; id: string }
  | { type: 'export'; scope: 'page' | 'selection' | 'collection'; format: ExportFormat; rowIndexes?: number[] }
  | { type: 'setMode'; mode: DataViewMode }
  | { type: 'selectRow'; rowIndex: number | null }
  | { type: 'copy'; text: string };

export type HostToPanel =
  | {
      type: 'init';
      serverName: string;
      collection: string;
      kind: CollectionKind;
      mode: DataViewMode;
      pageSize: number;
      readOnly: boolean;
      initialScript?: string;
      collections?: string[];
    }
  | { type: 'page'; result: PageResult }
  | { type: 'queryResult'; result: QueryResult }
  | { type: 'history'; entries: HistoryEntry[] }
  | { type: 'docSaved'; rowIndex: number | null; doc: Doc }
  | { type: 'editRejected'; rowIndex: number; field: string; oldValue: unknown; error: string }
  | { type: 'loading'; on: boolean }
  | { type: 'error'; message: string }
  | { type: 'openInsertDialog'; template?: Doc }
  | { type: 'openEditDialog'; rowIndex: number }
  | { type: 'setQuery'; script: string; run: boolean }
  | { type: 'theme' };

// ---- Documentation webview ----
export type DocsToHost =
  | { type: 'ready' }
  | { type: 'openTopic'; topicId: string; highlightTerms?: string[] }
  | { type: 'copyCode'; code: string }
  | { type: 'openInPlayground'; code: string };

export type HostToDocs =
  | { type: 'focusSearch' }
  | { type: 'expandAll' }
  | { type: 'collapseAll' }
  | { type: 'selectTopic'; topicId: string; highlightTerms?: string[] };

// ---- AxarDB Cloud webview ----
export type CloudToHost =
  | { type: 'ready' }
  | { type: 'requestBotChallenge' }
  | {
      type: 'login';
      email: string;
      password: string;
      botToken?: string;
      loadTs?: string;
      sessionToken?: string;
    }
  | { type: 'logout' }
  | { type: 'refresh' }
  | { type: 'registerFast'; email?: string; dbName?: string; subdomain?: string }
  | { type: 'connectDatabase'; dbId: string; name: string; subdomain: string; apiKey?: string }
  | { type: 'createApiKey'; dbId: string; keyName: string }
  | { type: 'createDatabase'; name: string; subdomain: string; plan: 'free' | 'paid' }
  | { type: 'copyText'; text: string; label?: string }
  | { type: 'openExternal'; url: string };

export type HostToCloud =
  | {
      type: 'state';
      state: CloudState;
      loading?: boolean;
      error?: string | null;
      info?: string | null;
    }
  | { type: 'botChallenge'; challenge: CloudBotChallenge | null }
  | { type: 'apiKeyCreated'; dbId: string; dbName: string; apiKey: string }
  | { type: 'focusFastCreate' };
