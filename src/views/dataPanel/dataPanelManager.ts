import * as vscode from 'vscode';
import { DataPanelController, DataPanelOptions } from './dataPanelController.js';
import {
  IAxarClient,
  IQueryBuilder,
  IHistoryStore,
  IExportService,
} from '../../contracts/services.js';
import { Doc } from '../../contracts/types.js';

export class DataPanelManager implements vscode.Disposable {
  private _panels = new Map<string, DataPanelController>();
  private _lastActiveController?: DataPanelController;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly clientProvider: (serverId: string) => IAxarClient | undefined,
    private readonly queryBuilder: IQueryBuilder,
    private readonly historyStore: IHistoryStore,
    private readonly exportService: IExportService
  ) {}

  private getKey(serverId: string, collection: string): string {
    return `${serverId}:${collection}`;
  }

  public open(options: DataPanelOptions): DataPanelController {
    const key = this.getKey(options.serverId, options.collection);
    const existing = this._panels.get(key);
    if (existing) {
      existing.reveal();
      this._lastActiveController = existing;
      return existing;
    }

    const client = this.clientProvider(options.serverId);
    if (!client) {
      throw new Error(`Cannot open collection: Server '${options.serverName}' is not connected`);
    }

    const controller = new DataPanelController(
      this.extensionUri,
      options,
      client,
      this.queryBuilder,
      this.historyStore,
      this.exportService,
      () => {
        this._panels.delete(key);
        if (this._lastActiveController === controller) {
          this._lastActiveController = undefined;
        }
      }
    );

    this._panels.set(key, controller);
    this._lastActiveController = controller;
    return controller;
  }

  public active(): DataPanelController | undefined {
    return this._lastActiveController;
  }

  public getRow(serverId: string, collection: string, rowIndex: number): Doc | undefined {
    const key = this.getKey(serverId, collection);
    const ctrl = this._panels.get(key);
    return ctrl?.getRow(rowIndex);
  }

  public dispose(): void {
    for (const ctrl of this._panels.values()) {
      ctrl.dispose();
    }
    this._panels.clear();
  }
}
