import * as vscode from 'vscode';
import { HistoryEntry, ServerId } from '../contracts/types.js';
import { IHistoryStore } from '../contracts/services.js';

const HISTORY_KEY_PREFIX = 'axardb.history.';

export class HistoryStore implements IHistoryStore, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<ServerId>();
  public readonly onDidChange: vscode.Event<ServerId> = this._onDidChange.event;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly maxItems: number = 200
  ) {}

  private getKey(serverId: ServerId): string {
    return `${HISTORY_KEY_PREFIX}${serverId}`;
  }

  private getEntries(serverId: ServerId): HistoryEntry[] {
    return this.memento.get<HistoryEntry[]>(this.getKey(serverId), []);
  }

  private async saveEntries(serverId: ServerId, entries: HistoryEntry[]): Promise<void> {
    await this.memento.update(this.getKey(serverId), entries);
    this._onDidChange.fire(serverId);
  }

  public list(
    serverId: ServerId,
    opts?: { collection?: string; search?: string; limit?: number }
  ): HistoryEntry[] {
    let entries = this.getEntries(serverId);

    if (opts?.collection) {
      entries = entries.filter((e) => e.collection === opts.collection);
    }

    if (opts?.search) {
      const q = opts.search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.script.toLowerCase().includes(q) ||
          (e.collection && e.collection.toLowerCase().includes(q))
      );
    }

    if (opts?.limit && opts.limit > 0) {
      entries = entries.slice(0, opts.limit);
    }

    return entries;
  }

  public async add(e: Omit<HistoryEntry, 'id'>): Promise<HistoryEntry> {
    const list = this.getEntries(e.serverId);

    // If identical script is at the very top, update its timestamp, status, and duration rather than duplicating
    const first = list[0];
    if (first && first.script.trim() === e.script.trim() && first.collection === e.collection) {
      const updated: HistoryEntry = {
        ...first,
        executedAt: e.executedAt,
        elapsedMs: e.elapsedMs,
        ok: e.ok,
        rowCount: e.rowCount,
        params: e.params,
      };
      list[0] = updated;
      await this.saveEntries(e.serverId, list);
      return updated;
    }

    const newEntry: HistoryEntry = {
      ...e,
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pinned: false,
    };

    // Prepend new entry
    list.unshift(newEntry);

    // Prune ring buffer without removing pinned entries
    if (list.length > this.maxItems) {
      // Find oldest unpinned entry from the end to remove
      for (let i = list.length - 1; i >= 0 && list.length > this.maxItems; i--) {
        const item = list[i];
        if (item && !item.pinned) {
          list.splice(i, 1);
        }
      }
    }

    await this.saveEntries(e.serverId, list);
    return newEntry;
  }

  public async pin(id: string, pinned: boolean): Promise<void> {
    // Search across server stores or track server
    // Iterate known keys in memento or find entry
    const keys = (this.memento as any).keys ? (this.memento as any).keys() : [];
    const serverKeys = keys.filter((k: string) => k.startsWith(HISTORY_KEY_PREFIX));

    for (const key of serverKeys) {
      const serverId = key.substring(HISTORY_KEY_PREFIX.length);
      const list = this.getEntries(serverId);
      const target = list.find((e) => e.id === id);
      if (target) {
        target.pinned = pinned;
        await this.saveEntries(serverId, list);
        return;
      }
    }
  }

  public async remove(id: string): Promise<void> {
    const keys = (this.memento as any).keys ? (this.memento as any).keys() : [];
    const serverKeys = keys.filter((k: string) => k.startsWith(HISTORY_KEY_PREFIX));

    for (const key of serverKeys) {
      const serverId = key.substring(HISTORY_KEY_PREFIX.length);
      const list = this.getEntries(serverId);
      const idx = list.findIndex((e) => e.id === id);
      if (idx !== -1) {
        list.splice(idx, 1);
        await this.saveEntries(serverId, list);
        return;
      }
    }
  }

  public async clear(serverId: ServerId): Promise<void> {
    // Keep only pinned entries
    const list = this.getEntries(serverId).filter((e) => e.pinned);
    await this.saveEntries(serverId, list);
  }

  public dispose(): void {
    this._onDidChange.dispose();
  }
}
