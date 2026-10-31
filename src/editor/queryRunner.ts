import * as vscode from 'vscode';
import { IConnectionManager, IAxarClient, IHistoryStore } from '../contracts/services.js';
import { DataPanelManager } from '../views/dataPanel/dataPanelManager.js';
import { Logger } from '../util/logger.js';

export class QueryRunner implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _runStatusBarItem: vscode.StatusBarItem;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly connectionManager: IConnectionManager,
    private readonly clientProvider: (serverId: string) => IAxarClient | undefined,
    private readonly dataPanelManager: DataPanelManager,
    private readonly historyStore: IHistoryStore,
    private readonly onServerMutated?: (serverId: string) => Promise<void>
  ) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this._statusBarItem.command = 'axardb.query.newEditor';

    this._runStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._runStatusBarItem.text = '$(play) Run AxarDB Query (Ctrl+Enter)';
    this._runStatusBarItem.tooltip = 'Execute the active AxarDB JavaScript query (Ctrl+Enter)';
    this._runStatusBarItem.command = 'axardb.query.run';
    this._runStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');

    this.updateStatusBar();
    this.updateEditorContext(vscode.window.activeTextEditor);

    this._disposables.push(
      this.connectionManager.onDidChange(() => {
        this.updateStatusBar();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateEditorContext(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (vscode.window.activeTextEditor && e.document === vscode.window.activeTextEditor.document) {
          this.updateEditorContext(vscode.window.activeTextEditor);
        }
      })
    );
  }

  private isAxarPlaygroundEditor(editor: vscode.TextEditor | undefined): boolean {
    if (!editor) return false;
    const doc = editor.document;
    if (doc.languageId === 'javascript') {
      const head = doc.getText(new vscode.Range(0, 0, Math.min(doc.lineCount, 20), 200));
      if (
        head.includes('@axardb') ||
        doc.isUntitled ||
        /\b(db|memory|bulk|view|trigger)\.[a-zA-Z0-9_]+\b/.test(head)
      ) {
        return true;
      }
    }
    return false;
  }

  private updateEditorContext(editor: vscode.TextEditor | undefined): void {
    const isBound = this.isAxarPlaygroundEditor(editor);
    void vscode.commands.executeCommand('setContext', 'axardb.editorBound', isBound);
    if (isBound) {
      this._runStatusBarItem.show();
    } else {
      this._runStatusBarItem.hide();
    }
  }

  private updateStatusBar(): void {
    const servers = this.connectionManager.list();
    const connected = servers.filter((s) => this.connectionManager.state(s.id) === 'connected');

    if (connected.length > 0) {
      this._statusBarItem.text = `$(database) AxarDB: ${connected[0]!.name}`;
      this._statusBarItem.tooltip = `Connected to ${connected[0]!.url} (Click to open Playground)`;
      this._statusBarItem.show();
    } else {
      this._statusBarItem.text = `$(database) AxarDB: Disconnected`;
      this._statusBarItem.hide();
    }
  }

  public async newEditor(
    serverId?: string,
    collection?: string,
    initialScript?: string
  ): Promise<void> {
    const servers = this.connectionManager.list();
    let targetServer = serverId ? this.connectionManager.get(serverId) : undefined;

    if (!targetServer && servers.length > 0) {
      // Prefer a currently connected server
      targetServer =
        servers.find((s) => this.connectionManager.state(s.id) === 'connected') || servers[0];
    }

    const sId = targetServer ? targetServer.id : 'default';
    const colName = collection || 'users';
    const bodyScript = initialScript || `db.${colName}.findall(x => true).take(50);`;

    const header =
      `// @axardb server=${sId} collection=${colName}\n` +
      `// Write AxarDB queries using JavaScript arrow functions\n` +
      `// Press Ctrl+Enter, click the ▶ Run button in the top-right toolbar, or click CodeLens below to run\n\n` +
      `${bodyScript}\n`;

    const doc = await vscode.workspace.openTextDocument({
      language: 'javascript',
      content: header,
    });

    const editor = await vscode.window.showTextDocument(doc);
    this.updateEditorContext(editor);
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

    // Parse server and collection from header (scan first 5 lines)
    const headerLines: string[] = [];
    for (let i = 0; i < Math.min(5, editor.document.lineCount); i++) {
      headerLines.push(editor.document.lineAt(i).text);
    }
    const headerText = headerLines.join('\n');
    const matchServer = headerText.match(/server=([^\s]+)/);
    const matchCol = headerText.match(/collection=([^\s]+)/);

    const serverIdFromHeader =
      matchServer && matchServer[1] && matchServer[1] !== 'default' ? matchServer[1] : undefined;
    let serverId = serverIdFromHeader;

    // Infer collection from script if `db.<col>.` / `memory.<col>.` / `bulk.<col>.` is present
    const scriptColMatch = script.match(/\b(?:db|memory|bulk)\.([a-zA-Z0-9_]+)\s*\./);
    const collection =
      (scriptColMatch && scriptColMatch[1]) ||
      (matchCol && matchCol[1] ? matchCol[1] : 'users');

    const servers = this.connectionManager.list();

    // If header serverId is no longer in connectionManager, clear it
    if (serverId && !this.connectionManager.get(serverId)) {
      serverId = undefined;
    }

    if (!serverId) {
      const connected = servers.find((s) => this.connectionManager.state(s.id) === 'connected');
      if (connected) {
        serverId = connected.id;
      } else if (servers.length === 1) {
        serverId = servers[0]!.id;
      } else if (servers.length > 1) {
        const picked = await vscode.window.showQuickPick(
          servers.map((s) => ({ label: s.name, description: s.url, id: s.id })),
          { title: 'Select AxarDB Server to Run Query' }
        );
        if (!picked) return;
        serverId = picked.id;
      }
    }

    if (!serverId) {
      vscode.window.showErrorMessage('No AxarDB server configured or connected.');
      return;
    }

    // Auto-connect if the selected server is not currently connected
    if (this.connectionManager.state(serverId) !== 'connected') {
      try {
        await this.connectionManager.connect(serverId);
        if (this.onServerMutated) {
          await this.onServerMutated(serverId);
        }
      } catch (err: unknown) {
        // If another server is connected, fallback to the connected server
        const fallbackConnected = servers.find(
          (s) => this.connectionManager.state(s.id) === 'connected'
        );
        if (fallbackConnected) {
          serverId = fallbackConnected.id;
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to connect to server: ${msg}`);
          return;
        }
      }
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

      // Refresh collections tree if script performed a mutation (insert, update, delete, drop)
      if (res.ok && this.onServerMutated && /\.\s*(insert|add|update|delete|remove|drop)\s*\(/i.test(script)) {
        void this.onServerMutated(serverId);
      }

      if (!res.ok) {
        const errMsg = res.error?.message || 'Query execution returned an error';
        vscode.window.showErrorMessage(`AxarDB Query Error: ${errMsg}`);
        return;
      }

      if (res.docs) {
        const panel = this.dataPanelManager.open({
          serverId,
          serverName,
          collection,
          kind: 'db',
          initialScript: script,
        });
        panel.reveal();
      } else {
        // Mutation or scalar result (e.g. insert({}), count(), update(), delete())
        vscode.window.showInformationMessage(
          `AxarDB query executed in ${res.elapsedMs}ms: ${JSON.stringify(res.data ?? 'OK')}`
        );
        // If it was an insert/update/delete on a collection, open/refresh the collection's DataPanel
        if (/\b(?:db|memory|bulk)\.[a-zA-Z0-9_]+\.(insert|add|update|delete)\s*\(/i.test(script)) {
          const panel = this.dataPanelManager.open({
            serverId,
            serverName,
            collection,
            kind: 'db',
          });
          panel.reveal();
        } else {
          const outDoc = await vscode.workspace.openTextDocument({
            language: 'json',
            content: JSON.stringify(res, null, 2),
          });
          await vscode.window.showTextDocument(outDoc, vscode.ViewColumn.Beside);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Query execution failed: ${msg}`);
      Logger.error(`Query runner error: ${msg}`);
    }
  }

  public dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._statusBarItem.dispose();
    this._runStatusBarItem.dispose();
  }
}
