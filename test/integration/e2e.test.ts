import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockAxarServer } from '../fixtures/mockServer.js';
import { AxarClient } from '../../src/client/axarClient.js';
import { QueryBuilder } from '../../src/query/queryBuilder.js';

describe('E2E Integration: AxarClient against MockAxarServer', () => {
  const PORT = 5987;
  let mockServer: MockAxarServer;
  let client: AxarClient;
  const qb = new QueryBuilder();

  beforeAll(async () => {
    mockServer = new MockAxarServer({
      port: PORT,
      user: 'admin',
      pass: 'admin123',
    });
    await mockServer.start();

    client = new AxarClient(async () => ({
      url: `http://localhost:${PORT}`,
      username: 'admin',
      password: 'admin123',
      timeoutMs: 5000,
    }));
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('pings the server successfully', async () => {
    const res = await client.ping('s1');
    expect(res.ok).toBe(true);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('lists and categorizes all 7 categories according to plan.md §3.3', async () => {
    const categories = await client.listCategories('s1');
    expect(categories.length).toBe(7);

    const kindMap = new Map(categories.map((c) => [c.kind, c]));

    // 1. DB (34 items)
    const dbCat = kindMap.get('db');
    expect(dbCat).toBeDefined();
    expect(dbCat!.label).toBe('DB');
    expect(dbCat!.items.length).toBe(34);

    // 2. SYS (4 items: sysusers, sysqueue, sysvaults, sysconfig)
    const sysCat = kindMap.get('system');
    expect(sysCat).toBeDefined();
    expect(sysCat!.label).toBe('SYS');
    expect(sysCat!.items.length).toBe(4);

    // 3. LOG (1 item: syslogs)
    const logCat = kindMap.get('log');
    expect(logCat).toBeDefined();
    expect(logCat!.label).toBe('LOG');
    expect(logCat!.items.length).toBe(1);

    // 4. MEMORY (1 item)
    const memCat = kindMap.get('memory');
    expect(memCat).toBeDefined();
    expect(memCat!.label).toBe('MEMORY');
    expect(memCat!.items.length).toBe(1);

    // 5. BULK (18 items)
    const bulkCat = kindMap.get('bulk');
    expect(bulkCat).toBeDefined();
    expect(bulkCat!.label).toBe('BULK');
    expect(bulkCat!.items.length).toBe(18);

    // 6. VIEW (2 items)
    const viewCat = kindMap.get('view');
    expect(viewCat).toBeDefined();
    expect(viewCat!.label).toBe('VIEW');
    expect(viewCat!.items.length).toBe(2);

    // 7. TRIGGER (2 items)
    const trigCat = kindMap.get('trigger');
    expect(trigCat).toBeDefined();
    expect(trigCat!.label).toBe('TRIGGER');
    expect(trigCat!.items.length).toBe(2);
  });

  it('queries documents with pagination and sorting', async () => {
    const { script, params } = qb.page({
      collection: 'col_01',
      kind: 'db',
      skip: 0,
      take: 10,
    });

    const res = await client.query({
      serverId: 's1',
      script,
      params: params as Record<string, string | number | boolean>,
    });

    expect(res.ok).toBe(true);
    expect(res.docs).toBeDefined();
    expect(res.docs!.length).toBeGreaterThan(0);
    expect(res.docs![0]!._id).toBeDefined();
  });

  it('performs complete insert, query, update, and delete lifecycle', async () => {
    // 1. Insert
    const insertScript = qb.insert('col_01', {
      name: 'Integration Test Item',
      status: 'new',
    });
    const insertRes = await client.query({ serverId: 's1', script: insertScript });
    expect(insertRes.ok).toBe(true);

    // 2. Count
    const countRes = await client.query({ serverId: 's1', script: 'db.col_01.count()' });
    expect(countRes.ok).toBe(true);
    expect(countRes.data).toBe(3); // 2 initial + 1 new

    // 3. Update
    const { script: updateScript, params: updateParams } = qb.updateById('col_01', 'id_1_col_01', {
      name: 'Updated Name',
    });
    const updateRes = await client.query({ serverId: 's1', script: updateScript, params: updateParams });
    expect(updateRes.ok).toBe(true);

    // 4. Delete
    const { script: deleteScript, params: deleteParams } = qb.deleteById('col_01', 'id_2_col_01');
    const deleteRes = await client.query({ serverId: 's1', script: deleteScript, params: deleteParams });
    expect(deleteRes.ok).toBe(true);
  });

  it('queries logs from mock server', async () => {
    const { script, params } = qb.logs({
      serverId: 's1',
      type: 'request',
      take: 50,
    });

    const res = await client.query({
      serverId: 's1',
      script,
      params: params as Record<string, string | number | boolean>,
    });

    expect(res.ok).toBe(true);
    expect(res.docs).toBeDefined();
  });
});
