import { DataPanelManager } from '../dataPanel/dataPanelManager.js';
import { LogType, ServerId } from '../../contracts/types.js';
import { ILogService, IQueryBuilder } from '../../contracts/services.js';

export class LogsPanelService {
  constructor(
    private readonly dataPanelManager: DataPanelManager,
    private readonly logService: ILogService,
    private readonly queryBuilder: IQueryBuilder
  ) {}

  public async openLogs(
    serverId: ServerId,
    serverName: string,
    collection: string,
    logType: LogType = 'all'
  ): Promise<void> {
    const { script } = this.queryBuilder.logs({
      serverId,
      type: logType,
      collection,
      take: 200,
    });

    const panel = this.dataPanelManager.open({
      serverId,
      serverName,
      collection: `logs_${logType}_${collection}`,
      kind: 'log',
      initialScript: script,
    });

    panel.reveal();
  }
}
