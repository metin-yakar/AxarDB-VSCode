import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockAxarServer } from '../fixtures/mockServer.js';
import { CATEGORY_ORDER } from '../../src/contracts/types.js';
import { Commands } from '../../src/contracts/commands.js';

describe('Scaffold & Mock Server Verification (Wave 0 / F0)', () => {
  let server: MockAxarServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = new MockAxarServer({ port: 5699, user: 'testuser', pass: 'testpass' });
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('contracts define expected 7 categories in order', () => {
    expect(CATEGORY_ORDER).toEqual([
      'db',
      'system',
      'log',
      'memory',
      'bulk',
      'view',
      'trigger'
    ]);
  });

  it('commands include all key command definitions', () => {
    expect(Commands.SERVER_ADD).toBe('axardb.server.add');
    expect(Commands.COLLECTION_OPEN).toBe('axardb.collection.open');
    expect(Commands.ROW_EDIT).toBe('axardb.row.edit');
    expect(Commands.QUERY_RUN).toBe('axardb.query.run');
  });

  it('mock server responds to /metrics', async () => {
    const auth = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
    const res = await fetch(`${baseUrl}/metrics`, {
      headers: { Authorization: auth }
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('healthy');
  });

  it('mock server enforces basic auth', async () => {
    const res = await fetch(`${baseUrl}/collections`);
    expect(res.status).toBe(401);
  });

  it('mock server lists collections with 34 DB collections + 4 SYS + syslogs', async () => {
    const auth = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
    const res = await fetch(`${baseUrl}/collections`, {
      headers: { Authorization: auth }
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as string[];
    expect(list.length).toBe(39); // 34 + 4 + 1
    expect(list).toContain('sysusers');
    expect(list).toContain('syslogs');
    expect(list).toContain('col_01');
  });

  it('mock server provides /memory/list and /bulk/list', async () => {
    const auth = 'Basic ' + Buffer.from('testuser:testpass').toString('base64');
    const memRes = await fetch(`${baseUrl}/memory/list`, {
      headers: { Authorization: auth }
    });
    expect(memRes.status).toBe(200);
    const memList = (await memRes.json()) as Array<{ name: string }>;
    expect(memList.length).toBe(1);

    const bulkRes = await fetch(`${baseUrl}/bulk/list`, {
      headers: { Authorization: auth }
    });
    expect(bulkRes.status).toBe(200);
    const bulkList = (await bulkRes.json()) as Array<{ name: string }>;
    expect(bulkList.length).toBe(18);
  });
});
