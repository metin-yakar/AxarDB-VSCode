import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockAxarServer } from '../fixtures/mockServer.js';
import { AxarClient, classifyCollections } from '../../src/client/axarClient.js';
import { CATEGORY_ORDER } from '../../src/contracts/types.js';

describe('AxarClient (Task A1)', () => {
  let server: MockAxarServer;
  let baseUrl: string;
  let client: AxarClient;

  beforeAll(async () => {
    server = new MockAxarServer({ port: 5799, user: 'testadmin', pass: 'secretpass' });
    baseUrl = await server.start();

    client = new AxarClient(async (serverId) => ({
      url: baseUrl,
      username: 'testadmin',
      password: 'secretpass',
      timeoutMs: 5000,
    }));
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('classifyCollections()', () => {
    it('accurately divides collection names into DB, SYS, and LOG', () => {
      const names = [
        'users',
        'sysusers',
        'orders',
        'syslogs',
        'sysconfig',
        'products',
        'sysqueue',
        'sysvaults'
      ];
      const result = classifyCollections(names);
      expect(result.db.map(c => c.name)).toEqual(['orders', 'products', 'users']);
      expect(result.system.map(c => c.name)).toEqual(['sysconfig', 'sysqueue', 'sysusers', 'sysvaults']);
      expect(result.log.map(c => c.name)).toEqual(['syslogs']);
    });
  });

  describe('query()', () => {
    it('executes simple count query successfully', async () => {
      const res = await client.query({
        serverId: 's1',
        script: 'db.col_01.count()',
      });
      expect(res.ok).toBe(true);
      expect(res.data).toBe(2);
      expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('injects query parameters safely into URL for server @param replacement', async () => {
      const res = await client.query({
        serverId: 's1',
        script: 'db.col_01.findall()',
        params: { __skip: 0, __take: 1 },
      });
      expect(res.ok).toBe(true);
      expect(res.docs).toBeDefined();
      expect(res.docs?.length).toBe(1);
    });

    it('returns error result gracefully on unauthorized access', async () => {
      const badClient = new AxarClient(async () => ({
        url: baseUrl,
        username: 'wrong',
        password: 'password',
      }));

      const res = await badClient.query({
        serverId: 's1',
        script: 'db.col_01.count()',
      });
      expect(res.ok).toBe(false);
      expect(res.error?.message).toContain('Authentication failed');
    });
  });

  describe('listCategories()', () => {
    it('fetches and returns exactly 7 categories matching CATEGORY_ORDER with expected counts', async () => {
      const categories = await client.listCategories('s1');
      expect(categories.length).toBe(7);
      expect(categories.map(c => c.kind)).toEqual(CATEGORY_ORDER);

      // Verify category items matching mock distributions
      const dbCat = categories.find(c => c.kind === 'db');
      expect(dbCat?.items.length).toBe(34);

      const sysCat = categories.find(c => c.kind === 'system');
      expect(sysCat?.items.length).toBe(4);
      expect(sysCat?.items.map(i => i.name)).toContain('sysusers');
      expect(sysCat?.items.map(i => i.name)).not.toContain('syslogs');

      const logCat = categories.find(c => c.kind === 'log');
      expect(logCat?.items.length).toBe(1);
      expect(logCat?.items[0]?.name).toBe('syslogs');

      const memCat = categories.find(c => c.kind === 'memory');
      expect(memCat?.items.length).toBe(1);
      expect(memCat?.items[0]?.name).toBe('active_sessions');

      const bulkCat = categories.find(c => c.kind === 'bulk');
      expect(bulkCat?.items.length).toBe(18);

      const viewCat = categories.find(c => c.kind === 'view');
      expect(viewCat?.items.length).toBe(2);

      const triggerCat = categories.find(c => c.kind === 'trigger');
      expect(triggerCat?.items.length).toBe(2);
    });
  });

  describe('ping() & dropCollection()', () => {
    it('pings server metrics successfully', async () => {
      const pingRes = await client.ping('s1');
      expect(pingRes.ok).toBe(true);
      expect(pingRes.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('drops collection using dropCollection()', async () => {
      await client.dropCollection('s1', 'col_34');
      const categories = await client.listCategories('s1');
      const dbCat = categories.find(c => c.kind === 'db');
      expect(dbCat?.items.find(i => i.name === 'col_34')).toBeUndefined();
    });
  });
});
