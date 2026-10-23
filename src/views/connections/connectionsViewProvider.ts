import * as vscode from 'vscode';
import { IConnectionManager, IAxarClient } from '../../contracts/services.js';
import { ConnToHost, HostToConn } from '../../contracts/messages.js';
import { CategoryInfo, CollectionKind, ServerConfig, ConnectionState, CATEGORY_ORDER } from '../../contracts/types.js';
import { getNonce } from '../../util/nonce.js';
import { Logger } from '../../util/logger.js';

export class ConnectionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'axardb.connections';

  private _view?: vscode.WebviewView;
  private _filterText = '';
  private _serverCategories: Map<string, CategoryInfo[]> = new Map();
  private _serverErrors: Map<string, string> = new Map();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionManager: IConnectionManager,
    private readonly clientProvider: (serverId: string) => IAxarClient | undefined
  ) {
    this.connectionManager.onDidChange(() => {
      this.refreshState();
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: ConnToHost) => {
      await this.handleMessage(msg);
    });
  }

  public focusFilter(): void {
    if (this._view) {
      this.postMessage({ type: 'focusFilter' });
    }
  }

  private async handleMessage(msg: ConnToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this.refreshState();
        break;

      case 'filterChanged':
        this._filterText = msg.text;
        break;

      case 'addServer':
        await vscode.commands.executeCommand('axardb.server.add');
        break;

      case 'connect':
        try {
          await this.connectionManager.connect(msg.serverId);
          await this.loadCategoriesForServer(msg.serverId);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to connect: ${errMsg}`);
        }
        break;

      case 'disconnect':
        this.connectionManager.disconnect(msg.serverId);
        this._serverCategories.delete(msg.serverId);
        this.refreshState();
        break;

      case 'refresh':
        if (msg.serverId) {
          await this.loadCategoriesForServer(msg.serverId);
        } else {
          await this.refreshAllServers();
        }
        break;

      case 'openCollection':
        await vscode.commands.executeCommand('axardb.collection.open', {
          serverId: msg.serverId,
          collection: msg.collection,
          kind: msg.kind,
        });
        break;
    }
  }

  public async loadCategoriesForServer(serverId: string): Promise<void> {
    const client = this.clientProvider(serverId);
    if (!client) return;

    try {
      const categories = await client.listCategories(serverId);
      this._serverCategories.set(serverId, categories);
      this._serverErrors.delete(serverId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._serverErrors.set(serverId, msg);
    }
    this.refreshState();
  }

  private async refreshAllServers(): Promise<void> {
    const servers = this.connectionManager.list();
    for (const s of servers) {
      if (this.connectionManager.state(s.id) === 'connected') {
        await this.loadCategoriesForServer(s.id);
      }
    }
    this.refreshState();
  }

  private refreshState(): void {
    if (!this._view) return;

    const servers = this.connectionManager.list().map((s) => ({
      ...s,
      state: this.connectionManager.state(s.id),
      categories: this._serverCategories.get(s.id),
      error: this._serverErrors.get(s.id),
    }));

    const config = vscode.workspace.getConfiguration('axardb.tree');
    const visibleCategories = config.get<CollectionKind[]>('categories') || [...CATEGORY_ORDER];

    this.postMessage({
      type: 'state',
      servers,
      filter: this._filterText,
      visibleCategories,
    });
  }

  private postMessage(msg: HostToConn): void {
    this._view?.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'connections.js'));
    const sharedCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'shared', 'theme.css'));
    const treeCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'connections', 'tree.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCssUri}">
  <link rel="stylesheet" href="${treeCssUri}">
  <title>AxarDB Connections</title>
</head>
<body>
  <div id="app" class="tree-container">
    <div class="filter-bar">
      <div class="filter-input-wrapper">
        <span class="filter-icon">🔍</span>
        <input type="text" id="filter-input" placeholder="Filter collections..." spellcheck="false" autocomplete="off" />
        <button id="filter-clear" class="icon-btn filter-clear-btn" title="Clear filter (Esc)">✕</button>
      </div>
    </div>
    <div id="tree-root" class="tree-content" role="tree" tabindex="0"></div>
    <div id="empty-state" class="empty-state" style="display: none;">
      <p>No AxarDB servers configured.</p>
      <button id="add-server-btn" class="btn">Add Server</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
