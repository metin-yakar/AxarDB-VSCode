import { LogQuery, QueryResult, ServerId } from '../contracts/types.js';
import { ILogService, IAxarClient, IQueryBuilder } from '../contracts/services.js';
import { Logger } from '../util/logger.js';

export class LogService implements ILogService {
  constructor(
    private readonly clientProvider: (serverId: ServerId) => IAxarClient | undefined,
    private readonly queryBuilder: IQueryBuilder
  ) {}

  public async fetch(q: LogQuery): Promise<QueryResult> {
    const client = this.clientProvider(q.serverId);
    if (!client) {
      throw new Error(`Client for server '${q.serverId}' not found or disconnected`);
    }

    const { script, params } = this.queryBuilder.logs(q);
    Logger.info(`Fetching logs [${q.type}] for server ${q.serverId}: ${script}`);

    const res = await client.query({
      serverId: q.serverId,
      script,
      params: params as Record<string, string | number | boolean>,
    });

    if (res.docs && res.docs.length > 0) {
      // Sort logs by timestamp desc (newest first)
      res.docs.sort((a, b) => {
        const tA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : 0;
        const tB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      });
    }

    return res;
  }
}
