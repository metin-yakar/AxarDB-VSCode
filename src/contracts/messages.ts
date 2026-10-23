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
  DataViewMode
} from './types.js';

// ---- Connections webview ----
export type ConnToHost =
  | { type: 'ready' }
  | { type: 'expand'; serverId: ServerId }
  | { type: 'toggleCategory'; serverId: ServerId; kind: CollectionKind; expanded: boolean }
  | { type: 'refresh'; serverId?: ServerId; kind?: CollectionKind }
  | { type: 'openCollection'; serverId: ServerId; collection: string; kind: CollectionKind }
  | { type: 'addServer' }
  | { type: 'connect' | 'disconnect'; serverId: ServerId }
  | { type: 'filterChanged'; text: string };

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
