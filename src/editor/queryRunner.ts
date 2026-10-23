import * as vscode from 'vscode';
import { IConnectionManager, IAxarClient, IHistoryStore } from '../contracts/services.js';
import { DataPanelManager } from '../views/dataPanel/dataPanelManager.js';
import { Logger } from '../util/logger.js';

export class QueryRunner {
  private _statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly connectionManager: IConnectionManager,
    private readonly clientProvider: (serverId: string) => IAxarClient | undefined,
    private readonly dataPanelManager: DataPanelManager,
    private readonly historyStore: IHistoryStore
  ) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.updateStatusBar();

    this.connectionManager.onDidChange(() => {
      this.updateStatusBar();
    });
  }

  private updateStatusBar(): void {
    const servers = this.connectionManager.list();
    const connected = servers.filter((s) => this.connectionManager.state(s.id) === 'connected');

    if (connected.length > 0) {
      this._statusBarItem.text = `$(database) AxarDB: ${connected[0]!.name}`;
      this._statusBarItem.tooltip = `Connected to ${connected[0]!.url}`;
      this._statusBarItem.show();
    } else {
      this._statusBarItem.text = `$(database) AxarDB: Disconnected`;
      this._statusBarItem.hide();
    }
  }

  public async newEditor(serverId?: string, collection?: string): Promise<void> {
    const servers = this.connectionManager.list();
    let targetServer = serverId ? this.connectionManager.get(serverId) : undefined;

    if (!targetServer && servers.length > 0) {
      targetServer = servers[0];
    }

    const sId = targetServer ? targetServer.id : 'default';
    const sName = targetServer ? targetServer.name : 'Local';
    const colName = collection || 'users';

    const header = `// @axardb server=${sId} collection=${colName}\n// Write AxarDB queries using JavaScript arrow functions\n// Press Ctrl+Enter or click the CodeLens button above to run\n\ndb.${colName}.findall(x => true).take(50);\n`;

    const doc = await vscode.workspace.openTextDocument({
      language: 'javascript',
      content: header,
    });

    await vscode.window.showTextDocument(doc);
  }

  public async run(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let script = editor.selection.isEmpty
      ? editor.document.getText()
      : editor.document.getText(editor.selection);

    // Strip comment header lines from executable script
    script = script
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .trim();

    if (!script) {
      vscode.window.showWarningMessage('No query script to run');
      return;
    }

    // Parse server and collection from header
    const firstLine = editor.document.lineAt(0).text;
    const matchServer = firstLine.match(/server=([^\s]+)/);
    const matchCol = firstLine.match(/collection=([^\s]+)/);

    const serverIdFromHeader = matchServer && matchServer[1] ? matchServer[1] : undefined;
    let serverId = serverIdFromHeader;
    const collection = matchCol && matchCol[1] ? matchCol[1] : 'query';

    if (!serverId) {
      const servers = this.connectionManager.list();
      const connected = servers.find((s) => this.connectionManager.state(s.id) === 'connected');
      if (connected) {
        serverId = connected.id;
      } else if (servers.length > 0) {
        serverId = servers[0]!.id;
      }
    }

    if (!serverId) {
      vscode.window.showErrorMessage('No AxarDB server configured or connected');
      return;
    }

    const client = this.clientProvider(serverId);
    if (!client) {
      vscode.window.showErrorMessage(`Client for server '${serverId}' not connected`);
      return;
    }

    const serverConfig = this.connectionManager.get(serverId);
    const serverName = serverConfig ? serverConfig.name : serverId;

    try {
      const res = await client.query({
        serverId,
        script,
      });

      await this.historyStore.add({
        serverId,
        collection,
        script,
        executedAt: res.executedAt,
        elapsedMs: res.elapsedMs,
        ok: res.ok,
        rowCount: res.docs ? res.docs.length : undefined,
      });

      if (res.ok && res.docs) {
        const panel = this.dataPanelManager.open({
          serverId,
          serverName,
          collection,
          kind: 'db',
          initialScript: script,
        });
        panel.reveal();
      } else {
        // Show raw result in untitled json doc
        const outDoc = await vscode.workspace.openTextDocument({
          language: 'json',
          content: JSON.stringify(res, null, 2),
        });
        await vscode.window.showTextDocument(outDoc, vscode.ViewColumn.Beside);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Query execution failed: ${msg}`);
      Logger.error(`Query runner error: ${msg}`);
    }
  }

  public dispose(): void {
    this._statusBarItem.dispose();
  }
}
