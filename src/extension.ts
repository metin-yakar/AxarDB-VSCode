import * as vscode from 'vscode';
import { Logger } from './util/logger.js';
import { AxarClient } from './client/axarClient.js';
import { ConnectionManager } from './connections/connectionManager.js';
import { ServerEditor } from './connections/serverEditor.js';
import { QueryBuilder } from './query/queryBuilder.js';
import { HistoryStore } from './history/historyStore.js';
import { ExportService } from './export/exportService.js';
import { LogService } from './logs/logService.js';
import { ConnectionsViewProvider } from './views/connections/connectionsViewProvider.js';
import { DataPanelManager } from './views/dataPanel/dataPanelManager.js';
import { LogsPanelService } from './views/logs/logsPanel.js';
import { QueryRunner } from './editor/queryRunner.js';
import { AxarCodeLensProvider } from './editor/codeLens.js';
import { registerServerCommands } from './commands/serverCommands.js';
import { registerCollectionCommands } from './commands/collectionCommands.js';
import { registerRowCommands } from './commands/rowCommands.js';
import { ServerConfig } from './contracts/types.js';

export function activate(context: vscode.ExtensionContext): void {
  Logger.log('AxarDB extension activating...');

  // Core singletons
  const queryBuilder = new QueryBuilder();
  const historyStore = new HistoryStore(context.globalState);
  context.subscriptions.push(historyStore);

  // Client factory
  const clientFactory = (config: ServerConfig, password: string) => {
    return new AxarClient(async (_serverId) => ({
      url: config.url,
      username: config.username,
      password,
      timeoutMs: config.timeoutMs,
    }));
  };

  // Connection manager
  const connectionManager = new ConnectionManager(context.globalState, context.secrets, clientFactory);
  context.subscriptions.push(connectionManager);

  // Client provider helper
  const clientProvider = (serverId: string) => {
    return connectionManager.getClient(serverId);
  };

  // Export & Log services
  const exportService = new ExportService(clientProvider, queryBuilder);
  const logService = new LogService(clientProvider, queryBuilder);

  // Data Panel Manager & Logs Panel
  const dataPanelManager = new DataPanelManager(
    context.extensionUri,
    clientProvider,
    queryBuilder,
    historyStore,
    exportService
  );
  context.subscriptions.push(dataPanelManager);

  const logsPanelService = new LogsPanelService(dataPanelManager, logService, queryBuilder);

  // Server Editor
  const serverEditor = new ServerEditor(connectionManager, clientFactory);

  // Query Runner & CodeLens
  const queryRunner = new QueryRunner(connectionManager, clientProvider, dataPanelManager, historyStore);
  context.subscriptions.push(queryRunner);

  const codeLensProvider = new AxarCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'javascript' }, codeLensProvider)
  );

  // Connections WebviewView Provider
  const connectionsViewProvider = new ConnectionsViewProvider(
    context.extensionUri,
    connectionManager,
    clientProvider
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ConnectionsViewProvider.viewType,
      connectionsViewProvider
    )
  );

  // Register command modules
  registerServerCommands(context, connectionManager, serverEditor, connectionsViewProvider);
  registerCollectionCommands(
    context,
    connectionManager,
    clientProvider,
    queryBuilder,
    exportService,
    dataPanelManager,
    logsPanelService,
    queryRunner,
    connectionsViewProvider
  );
  registerRowCommands(
    context,
    dataPanelManager,
    clientProvider,
    queryBuilder,
    logsPanelService,
    queryRunner
  );

  // Query commands
  context.subscriptions.push(
    vscode.commands.registerCommand('axardb.query.newEditor', async (arg?: { serverId?: string; collection?: string }) => {
      await queryRunner.newEditor(arg?.serverId, arg?.collection);
    }),
    vscode.commands.registerCommand('axardb.query.run', async () => {
      await queryRunner.run();
    }),
    vscode.commands.registerCommand('axardb.history.show', async () => {
      const servers = connectionManager.list();
      if (servers.length === 0) return;
      const sPick = await vscode.window.showQuickPick(
        servers.map((s) => ({ label: s.name, id: s.id })),
        { title: 'Select Server for History' }
      );
      if (!sPick) return;
      const entries = historyStore.list(sPick.id);
      if (entries.length === 0) {
        vscode.window.showInformationMessage('No query history for this server.');
        return;
      }
      const itemPick = await vscode.window.showQuickPick(
        entries.map((e) => ({
          label: e.script,
          description: `${e.executedAt} (${e.elapsedMs}ms)`,
          script: e.script,
        })),
        { title: 'Select Query to Run' }
      );
      if (itemPick) {
        await queryRunner.newEditor(sPick.id);
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((b) => b.insert(new vscode.Position(editor.document.lineCount, 0), `\n${itemPick.script}\n`));
        }
      }
    })
  );

  Logger.log('AxarDB extension activated successfully.');
}

export function deactivate(): void {
  Logger.log('AxarDB extension deactivated.');
}
