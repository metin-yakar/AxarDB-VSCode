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
import { CloudViewProvider } from './views/cloud/cloudViewProvider.js';
import { AxarCloudService } from './cloud/axarCloudService.js';
import { DocumentationViewProvider } from './views/documentation/documentationViewProvider.js';
import { DocumentationPanel } from './views/documentation/documentationPanel.js';
import { DataPanelManager } from './views/dataPanel/dataPanelManager.js';
import { LogsPanelService } from './views/logs/logsPanel.js';
import { QueryRunner } from './editor/queryRunner.js';
import { AxarCodeLensProvider } from './editor/codeLens.js';
import { WorkspaceAiContextService } from './context/workspaceAiContextService.js';
import { registerServerCommands } from './commands/serverCommands.js';
import { registerCollectionCommands } from './commands/collectionCommands.js';
import { registerRowCommands } from './commands/rowCommands.js';
import { Commands } from './contracts/commands.js';
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

  // Workspace AI Context Service (auto-generates .axardb-context.md & updates .gitignore on connect)
  const workspaceAiContextService = new WorkspaceAiContextService(
    connectionManager,
    clientProvider
  );
  context.subscriptions.push(workspaceAiContextService);

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

  // Connections WebviewView Provider
  const connectionsViewProvider = new ConnectionsViewProvider(
    context.extensionUri,
    connectionManager,
    clientProvider,
    (serverId, categories) => {
      workspaceAiContextService.updateServerCategories(serverId, categories);
    }
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ConnectionsViewProvider.viewType,
      connectionsViewProvider
    )
  );

  // Query Runner & CodeLens
  const queryRunner = new QueryRunner(
    connectionManager,
    clientProvider,
    dataPanelManager,
    historyStore,
    async (serverId) => {
      await connectionsViewProvider.loadCategoriesForServer(serverId);
    }
  );
  context.subscriptions.push(queryRunner);

  const codeLensProvider = new AxarCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'javascript' }, codeLensProvider)
  );

  // AxarDB Cloud Service & Cloud Panel / QuickPick Launcher
  const cloudService = new AxarCloudService(context.globalState, context.secrets);
  const cloudViewProvider = new CloudViewProvider(
    context.extensionUri,
    cloudService,
    connectionManager
  );
  context.subscriptions.push(
    cloudViewProvider,
    vscode.commands.registerCommand(Commands.CLOUD_OPEN, async () => {
      await cloudViewProvider.openCloudMenu();
    }),
    vscode.commands.registerCommand(Commands.CLOUD_REFRESH, async () => {
      await cloudViewProvider.refresh();
    }),
    vscode.commands.registerCommand(Commands.CLOUD_FAST_CREATE, async () => {
      await cloudViewProvider.provisionTemporaryDatabaseInstant();
    }),
    vscode.commands.registerCommand(Commands.CLOUD_LOGOUT, async () => {
      await cloudViewProvider.logout();
    })
  );

  // Documentation WebviewView Provider & Documentation Viewer Panel
  const openSnippetInPlayground = async (code: string) => {
    await queryRunner.newEditor();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await editor.edit((b) =>
        b.insert(new vscode.Position(editor.document.lineCount, 0), `\n${code}\n`)
      );
    }
  };

  let documentationViewProvider: DocumentationViewProvider;
  const documentationPanel = new DocumentationPanel(
    context.extensionUri,
    openSnippetInPlayground,
    (topicId: string) => {
      documentationViewProvider.selectTopic(topicId);
    }
  );
  context.subscriptions.push(documentationPanel);

  documentationViewProvider = new DocumentationViewProvider(
    context.extensionUri,
    (topicId: string, highlightTerms?: string[]) => {
      documentationPanel.showTopic(topicId, highlightTerms);
    },
    openSnippetInPlayground
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DocumentationViewProvider.viewType,
      documentationViewProvider
    ),
    vscode.commands.registerCommand(Commands.DOCS_FOCUS_SEARCH, () => {
      documentationViewProvider.focusSearch();
    }),
    vscode.commands.registerCommand(Commands.DOCS_EXPAND_ALL, () => {
      documentationViewProvider.expandAll();
    }),
    vscode.commands.registerCommand(Commands.DOCS_COLLAPSE_ALL, () => {
      documentationViewProvider.collapseAll();
    })
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
    vscode.commands.registerCommand('axardb.query.runSelection', async () => {
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
