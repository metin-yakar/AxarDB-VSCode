import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryStore } from '../../src/history/historyStore.js';

class MockMemento {
  public data = new Map<string, any>();
  get<T>(key: string, defaultValue?: T): T {
    return this.data.has(key) ? this.data.get(key) : (defaultValue as T);
  }
  async update(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }
  keys(): string[] {
    return Array.from(this.data.keys());
  }
}

describe('HistoryStore', () => {
  let memento: MockMemento;
  let store: HistoryStore;

  beforeEach(() => {
    memento = new MockMemento();
    store = new HistoryStore(memento as any, 5); // limit to 5 items for testing ring buffer
  });

  it('starts with empty history', () => {
    expect(store.list('s1')).toEqual([]);
  });

  it('adds history entries and retrieves them most recent first', async () => {
    await store.add({
      serverId: 's1',
      script: 'db.users.count()',
      executedAt: '2026-10-23T10:00:00Z',
      elapsedMs: 5,
      ok: true,
      rowCount: 1,
    });

    await store.add({
      serverId: 's1',
      script: 'db.orders.count()',
      executedAt: '2026-10-23T10:01:00Z',
      elapsedMs: 8,
      ok: true,
      rowCount: 1,
    });

    const list = store.list('s1');
    expect(list.length).toBe(2);
    expect(list[0]!.script).toBe('db.orders.count()');
    expect(list[1]!.script).toBe('db.users.count()');
  });

  it('updates duplicate consecutive queries instead of adding duplicate', async () => {
    await store.add({
      serverId: 's1',
      script: 'db.users.findall(x => true).take(10)',
      executedAt: '2026-10-23T10:00:00Z',
      elapsedMs: 20,
      ok: true,
      rowCount: 10,
    });

    await store.add({
      serverId: 's1',
      script: 'db.users.findall(x => true).take(10)',
      executedAt: '2026-10-23T10:05:00Z',
      elapsedMs: 15,
      ok: true,
      rowCount: 10,
    });

    const list = store.list('s1');
    expect(list.length).toBe(1);
    expect(list[0]!.elapsedMs).toBe(15);
    expect(list[0]!.executedAt).toBe('2026-10-23T10:05:00Z');
  });

  it('respects ring buffer size while preserving pinned entries', async () => {
    // Add first entry and pin it
    const first = await store.add({
      serverId: 's1',
      script: 'pinned query',
      executedAt: '2026-10-23T10:00:00Z',
      elapsedMs: 1,
      ok: true,
    });

    await store.pin(first.id, true);

    // Add 5 more entries
    for (let i = 1; i <= 5; i++) {
      await store.add({
        serverId: 's1',
        script: `query ${i}`,
        executedAt: `2026-10-23T10:0${i}:00Z`,
        elapsedMs: 1,
        ok: true,
      });
    }

    const list = store.list('s1');
    expect(list.length).toBe(5);
    // Pinned entry must not have been purged even though it was the oldest
    expect(list.some((e) => e.script === 'pinned query')).toBe(true);
  });

  it('supports search and collection filters', async () => {
    await store.add({
      serverId: 's1',
      collection: 'users',
      script: 'db.users.find(x => x._id == "1")',
      executedAt: '2026-10-23T10:00:00Z',
      elapsedMs: 1,
      ok: true,
    });

    await store.add({
      serverId: 's1',
      collection: 'orders',
      script: 'db.orders.findall(x => x.total > 100)',
      executedAt: '2026-10-23T10:01:00Z',
      elapsedMs: 1,
      ok: true,
    });

    const filtered = store.list('s1', { collection: 'users' });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.collection).toBe('users');

    const searched = store.list('s1', { search: 'total' });
    expect(searched.length).toBe(1);
    expect(searched[0]!.collection).toBe('orders');
  });

  it('clears unpinned items on clear', async () => {
    const e1 = await store.add({
      serverId: 's1',
      script: 'q1',
      executedAt: '2026-10-23T10:00:00Z',
      elapsedMs: 1,
      ok: true,
    });
    await store.pin(e1.id, true);

    await store.add({
      serverId: 's1',
      script: 'q2',
      executedAt: '2026-10-23T10:01:00Z',
      elapsedMs: 1,
      ok: true,
    });

    await store.clear('s1');
    const remaining = store.list('s1');
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.script).toBe('q1');
  });
});

