import { describe, it, expect, vi } from 'vitest';
import { LogService } from '../../src/logs/logService.js';
import { QueryBuilder } from '../../src/query/queryBuilder.js';

describe('LogService', () => {
  const qb = new QueryBuilder();

  it('fetches logs and sorts results descending by timestamp', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      ok: true,
      docs: [
        { _id: '1', timestamp: '2026-10-23T10:00:00Z', type: 'request', query: 'q1' },
        { _id: '2', timestamp: '2026-10-23T10:05:00Z', type: 'request', query: 'q2' },
        { _id: '3', timestamp: '2026-10-23T09:30:00Z', type: 'request', query: 'q0' },
      ],
      elapsedMs: 12,
      script: 'db.syslogs.findall(...)',
      executedAt: '2026-10-23T10:06:00Z',
    });

    const mockClient = { query: mockQuery } as any;
    const logService = new LogService(() => mockClient, qb);

    const res = await logService.fetch({
      serverId: 's1',
      type: 'request',
      take: 100,
    });

    expect(res.ok).toBe(true);
    expect(res.docs).toBeDefined();
    expect(res.docs!.length).toBe(3);
    // Newest first
    expect(res.docs![0]!._id).toBe('2');
    expect(res.docs![1]!._id).toBe('1');
    expect(res.docs![2]!._id).toBe('3');
  });

  it('throws error if server client is not available', async () => {
    const logService = new LogService(() => undefined, qb);

    await expect(
      logService.fetch({
        serverId: 's2',
        type: 'error',
      })
    ).rejects.toThrow("Client for server 's2' not found");
  });
});
