import { Doc, CollectionKind, DataViewMode } from '../../src/contracts/types.js';

export interface DataPanelState {
  serverName: string;
  collection: string;
  kind: CollectionKind;
  mode: DataViewMode;
  readOnly: boolean;
  pageSize: number;
  skip: number;
  total: number;
  docs: Doc[];
  selectedRowIndex: number | null;
  selectedDoc: Doc | null;
  loading: boolean;
  error: string | null;
  queryScript: string;
  elapsedMs: number;
  sidePanelVisible: boolean;
  knownCollections: string[];
}

export type StoreListener = (state: DataPanelState) => void;

class DataPanelStore {
  private _state: DataPanelState = {
    serverName: '',
    collection: '',
    kind: 'db',
    mode: 'grid',
    readOnly: false,
    pageSize: 50,
    skip: 0,
    total: 0,
    docs: [],
    selectedRowIndex: null,
    selectedDoc: null,
    loading: false,
    error: null,
    queryScript: '',
    elapsedMs: 0,
    sidePanelVisible: true,
    knownCollections: [],
  };

  private _listeners: Set<StoreListener> = new Set();

  public getState(): DataPanelState {
    return this._state;
  }

  public update(patch: Partial<DataPanelState>): void {
    this._state = { ...this._state, ...patch };
    // Maintain selectedDoc in sync if selectedRowIndex or docs change
    if (this._state.selectedRowIndex !== null && this._state.docs[this._state.selectedRowIndex]) {
      this._state.selectedDoc = this._state.docs[this._state.selectedRowIndex]!;
    } else if (this._state.selectedRowIndex === null) {
      this._state.selectedDoc = null;
    }

    this.notify();
  }

  public selectRow(index: number | null): void {
    if (index === null || !this._state.docs[index]) {
      this.update({ selectedRowIndex: null, selectedDoc: null });
    } else {
      this.update({ selectedRowIndex: index, selectedDoc: this._state.docs[index]! });
    }
  }

  public subscribe(listener: StoreListener): () => void {
    this._listeners.add(listener);
    listener(this._state);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }
}

export const store = new DataPanelStore();
