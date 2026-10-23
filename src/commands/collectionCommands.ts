import * as vscode from 'vscode';
import { CollectionKind, ExportFormat, LogType, ServerId, TemplateKind } from '../contracts/types.js';
import { IConnectionManager, IAxarClient, IQueryBuilder, IExportService } from '../contracts/services.js';
import { DataPanelManager } from '../views/dataPanel/dataPanelManager.js';
import { LogsPanelService } from '../views/logs/logsPanel.js';
import { QueryRunner } from '../editor/queryRunner.js';
import { ConnectionsViewProvider } from '../views/connections/connectionsViewProvider.js';

export interface CollectionContextArg {
  serverId: ServerId;
  collection: string;
  kind?: CollectionKind;
}

export function registerCollectionCommands(
  context: vscode.ExtensionContext,
  connectionManager: IConnectionManager,
  clientProvider: (serverId: string) => IAxarClient | undefined,
  queryBuilder: IQueryBuilder,
  exportService: IExportService,
  dataPanelManager: DataPanelManager,
  logsPanelService: LogsPanelService,
  queryRunner: QueryRunner,
  connectionsViewProvider: ConnectionsViewProvider
): void {
  // Helper to resolve collection arg from context menu or prompt
  const resolveArg = async (arg?: CollectionContextArg): Promise<CollectionContextArg | undefined> => {
    if (arg && arg.serverId && arg.collection) {
      return arg;
    }
    const servers = connectionManager.list();
    const connected = servers.filter((s) => connectionManager.state(s.id) === 'connected');
    if (connected.length === 0) {
      vscode.window.showInformationMessage('No connected AxarDB servers.');
      return undefined;
    }

    const sPick = await vscode.window.showQuickPick(
      connected.map((s) => ({ label: s.name, serverId: s.id })),
      { title: 'Select Server' }
    );
    if (!sPick) return undefined;

    const colName = await vscode.window.showInputBox({
      title: 'Enter Collection Name',
      value: 'users',
    });
    if (!colName) return undefined;

    return {
      serverId: sPick.serverId,
      collection: colName.trim(),
      kind: 'db',
    };
  };

  // Open collection
  context.subscriptions.push(
    vscode.commands.registerCommand('axardb.collection.open', async (arg?: CollectionContextArg) => {
      const resolved = await resolveArg(arg);
      if (!resolved) return;

      const server = connectionManager.get(resolved.serverId);
      const serverName = server ? server.name : resolved.serverId;

      const panel = dataPanelManager.open({
        serverId: resolved.serverId,
        serverName,
        collection: resolved.collection,
        kind: resolved.kind || 'db',
      });
      panel.reveal();
    }),

    vscode.commands.registerCommand('axardb.connections.focusFilter', () => {
      connectionsViewProvider.focusFilter();
    }),

    vscode.commands.registerCommand('axardb.collection.copyName', async (arg?: CollectionContextArg) => {
      const resolved = await resolveArg(arg);
      if (resolved) {
        await vscode.env.clipboard.writeText(resolved.collection);
        vscode.window.showInformationMessage(`Copied '${resolved.collection}' to clipboard`);
      }
    }),

    vscode.commands.registerCommand('axardb.collection.drop', async (arg?: CollectionContextArg) => {
      const resolved = await resolveArg(arg);
      if (!resolved) return;

      if (resolved.kind && resolved.kind !== 'db') {
        vscode.window.showWarningMessage(`Cannot drop system or non-DB collection '${resolved.collection}'.`);
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to permanently DROP collection '${resolved.collection}'? This cannot be undone!`,
        { modal: true },
        'Drop Collection'
      );

      if (confirm === 'Drop Collection') {
        const client = clientProvider(resolved.serverId);
        if (!client) return;

        try {
          await client.dropCollection(resolved.serverId, resolved.collection);
          vscode.window.showInformationMessage(`Collection '${resolved.collection}' dropped.`);
          await connectionsViewProvider.loadCategoriesForServer(resolved.serverId);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Drop failed: ${msg}`);
        }
      }
    })
  );

  // Export commands
  const registerExportCmd = (cmdId: string, format: ExportFormat) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmdId, async (arg?: CollectionContextArg) => {
        const resolved = await resolveArg(arg);
        if (!resolved) return;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Exporting ${resolved.collection} (${format.toUpperCase()})...`,
            cancellable: true,
          },
          async (progress, token) => {
            const uri = await exportService.exportCollection(
              resolved.serverId,
              resolved.collection,
              format,
              progress,
              token
            );
            if (uri) {
              const openFile = await vscode.window.showInformationMessage(
                `Exported ${resolved.collection} to ${uri.fsPath}`,
                'Open File'
              );
              if (openFile === 'Open File') {
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
              }
            }
          }
        );
      })
    );
  };

  registerExportCmd('axardb.collection.exportJson', 'json');
  registerExportCmd('axardb.collection.exportJsonl', 'jsonl');
  registerExportCmd('axardb.collection.exportCsv', 'csv');

  // Template commands
  const registerTemplateCmd = (cmdId: string, kind: TemplateKind) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmdId, async (arg?: CollectionContextArg) => {
        const resolved = await resolveArg(arg);
        if (!resolved) return;

        const template = queryBuilder.template(kind, resolved.collection, {
          kindOfStore: resolved.kind || 'db',
        });

        // Insert into active editor or open new query editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.languageId === 'javascript') {
          activeEditor.edit((edit) => {
            edit.insert(activeEditor.selection.active, `\n${template}\n`);
          });
        } else {
          await queryRunner.newEditor(resolved.serverId, resolved.collection);
        }
      })
    );
  };

  registerTemplateCmd('axardb.collection.template.find', 'find');
  registerTemplateCmd('axardb.collection.template.findOne', 'findOne');
  registerTemplateCmd('axardb.collection.template.count', 'count');
  registerTemplateCmd('axardb.collection.template.insert', 'insert');
  registerTemplateCmd('axardb.collection.template.update', 'update');
  registerTemplateCmd('axardb.collection.template.updateById', 'updateById');
  registerTemplateCmd('axardb.collection.template.delete', 'delete');
  registerTemplateCmd('axardb.collection.template.deleteById', 'deleteById');

  // Log commands
  const registerLogCmd = (cmdId: string, logType: LogType) => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmdId, async (arg?: CollectionContextArg) => {
        const resolved = await resolveArg(arg);
        if (!resolved) return;

        const server = connectionManager.get(resolved.serverId);
        const serverName = server ? server.name : resolved.serverId;

        await logsPanelService.openLogs(resolved.serverId, serverName, resolved.collection, logType);
      })
    );
  };

  registerLogCmd('axardb.collection.logs.request', 'request');
  registerLogCmd('axardb.collection.logs.error', 'error');
  registerLogCmd('axardb.collection.logs.debug', 'debug');
  registerLogCmd('axardb.collection.logs.backup', 'backup');
  registerLogCmd('axardb.collection.logs.queue', 'queue');
  registerLogCmd('axardb.collection.logs.view', 'view');
  registerLogCmd('axardb.collection.logs.trigger', 'trigger');
  registerLogCmd('axardb.collection.logs.all', 'all');

  // Category commands
  context.subscriptions.push(
    vscode.commands.registerCommand('axardb.category.refresh', async (arg?: { serverId?: string }) => {
      if (arg?.serverId) {
        await connectionsViewProvider.loadCategoriesForServer(arg.serverId);
      } else {
        const servers = connectionManager.list();
        for (const s of servers) {
          if (connectionManager.state(s.id) === 'connected') {
            await connectionsViewProvider.loadCategoriesForServer(s.id);
          }
        }
      }
    }),
    vscode.commands.registerCommand('axardb.category.collapseAll', () => {
      // Refreshing view collapses state
      vscode.commands.executeCommand('axardb.category.refresh');
    })
  );
}
