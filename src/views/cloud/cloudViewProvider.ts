import * as vscode from 'vscode';
import { CloudToHost, HostToCloud } from '../../contracts/messages.js';
import { IConnectionManager } from '../../contracts/services.js';
import { AxarCloudService, formatIsoDateTime } from '../../cloud/axarCloudService.js';
import { getNonce } from '../../util/nonce.js';

export class CloudViewProvider implements vscode.Disposable {
  public static readonly viewType = 'axardb.cloudPanel';

  private _panel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly cloudService: AxarCloudService,
    private readonly connectionManager: IConnectionManager
  ) {}

  /**
   * Presents the user with the AxarDB Cloud options QuickPick menu when clicking
   * the Cloud button next to Add Server.
   */
  public async openCloudMenu(): Promise<void> {
    const user = this.cloudService.getUser();
    const hasToken = Boolean(await this.cloudService.getSessionToken());

    interface CloudQuickPickItem extends vscode.QuickPickItem {
      action: 'fastCreate' | 'openPanel' | 'logout';
    }

    const items: CloudQuickPickItem[] = [
      {
        label: '$(zap) Create Temporary Cloud Database',
        description: 'Instant 1-hour trial (No account or user info required)',
        detail: 'Automatically provisions a temporary AxarDB Cloud server and connects it to VS Code',
        action: 'fastCreate',
      },
      {
        label:
          hasToken && user
            ? `$(server-environment) View My Cloud Servers (${user.email})`
            : '$(account) Sign In to AxarDB Cloud (Existing Account)',
        description: 'axardb.com membership',
        detail: 'View your cloud servers, site details, quotas, and Expire Dates, or connect them to VS Code',
        action: 'openPanel',
      },
    ];

    if (hasToken) {
      items.push({
        label: '$(sign-out) Sign Out from AxarDB Cloud',
        description: user?.email || '',
        detail: 'Clear stored AxarDB Cloud session from VS Code SecretStorage',
        action: 'logout',
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'AxarDB Cloud — Select an Option',
      placeHolder: 'Create an instant temporary database or sign in to your axardb.com account',
    });

    if (!picked) return;

    if (picked.action === 'fastCreate') {
      await this.provisionTemporaryDatabaseInstant();
    } else if (picked.action === 'openPanel') {
      await this.showPanel();
    } else if (picked.action === 'logout') {
      await this.logout();
    }
  }

  /**
   * 1-Click Zero-Input Temporary Database Provisioning.
   * Requires no personal information from the user.
   */
  public async provisionTemporaryDatabaseInstant(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AxarDB Cloud: Provisioning temporary cloud database...',
        cancellable: false,
      },
      async () => {
        try {
          const fastRes = await this.cloudService.registerFast();
          const expFormatted = fastRes.database.expires_at
            ? formatIsoDateTime(fastRes.database.expires_at)
            : '1 hour';

          await this.cloudService.connectDatabaseToExtension(
            {
              dbId: fastRes.database.id,
              name: fastRes.database.name,
              subdomain: fastRes.database.subdomain,
              apiKey: fastRes.apiKey,
              expiresAt: fastRes.database.expires_at ?? undefined,
              plan: fastRes.database.plan,
            },
            this.connectionManager
          );

          if (this._panel) {
            await this.pushState({
              info: `⚡ Temporary database '${fastRes.database.subdomain}.axardb.com' provisioned and connected! (Expires: ${expFormatted})`,
            });
          }

          vscode.window.showInformationMessage(
            `AxarDB Cloud: Temporary database 'https://${fastRes.database.subdomain}.axardb.com' created and connected! (Expires: ${expFormatted})`
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (this._panel) {
            await this.pushState({ error: errMsg });
          }
          vscode.window.showErrorMessage(`AxarDB Cloud Error: ${errMsg}`);
        }
      }
    );
  }

  public async showPanel(): Promise<void> {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (this._panel) {
      this._panel.reveal(column);
      await this.refresh();
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      CloudViewProvider.viewType,
      'AxarDB Cloud',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(async (msg: CloudToHost) => {
      await this.handleMessage(msg);
    });

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  public async refresh(): Promise<void> {
    if (!this._panel) return;
    await this.pushState({ loading: true });
    await this.pushState();
  }

  public async logout(): Promise<void> {
    await this.cloudService.logout();
    if (this._panel) {
      await this.pushState({ info: 'Signed out from AxarDB Cloud.' });
      const challenge = await this.cloudService.getBotChallenge();
      this.postMessage({ type: 'botChallenge', challenge });
    }
    vscode.window.showInformationMessage('Signed out from AxarDB Cloud.');
  }

  public focusFastCreate(): void {
    void this.provisionTemporaryDatabaseInstant();
  }

  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
  }

  private async pushState(opts?: {
    loading?: boolean;
    error?: string | null;
    info?: string | null;
  }): Promise<void> {
    if (!this._panel) return;
    const state = await this.cloudService.getState();
    this.postMessage({
      type: 'state',
      state,
      loading: opts?.loading ?? false,
      error: opts?.error ?? null,
      info: opts?.info ?? null,
    });
  }

  private async handleMessage(msg: CloudToHost): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        await this.pushState();
        const challenge = await this.cloudService.getBotChallenge();
        this.postMessage({ type: 'botChallenge', challenge });
        break;
      }

      case 'requestBotChallenge': {
        const challenge = await this.cloudService.getBotChallenge();
        this.postMessage({ type: 'botChallenge', challenge });
        break;
      }

      case 'refresh': {
        await this.refresh();
        break;
      }

      case 'login': {
        try {
          await this.pushState({ loading: true });
          const res = await this.cloudService.login({
            email: msg.email,
            password: msg.password,
            botToken: msg.botToken,
            loadTs: msg.loadTs,
            sessionToken: msg.sessionToken,
          });
          await this.pushState({
            info: `Signed in as ${res.user.email} — ${res.databases.length} cloud server(s) loaded.`,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.pushState({ error: errMsg });
          const challenge = await this.cloudService.getBotChallenge();
          this.postMessage({ type: 'botChallenge', challenge });
        }
        break;
      }

      case 'logout': {
        await this.logout();
        break;
      }

      case 'registerFast': {
        await this.provisionTemporaryDatabaseInstant();
        break;
      }

      case 'connectDatabase': {
        try {
          await this.pushState({ loading: true });
          const srv = await this.cloudService.connectDatabaseToExtension(
            {
              dbId: msg.dbId,
              name: msg.name,
              subdomain: msg.subdomain,
              apiKey: msg.apiKey,
            },
            this.connectionManager
          );
          await this.pushState({
            info: `🔌 Connected '${srv.name}' to VS Code Connections!`,
          });
          vscode.window.showInformationMessage(
            `AxarDB Cloud server connected: ${srv.name} (${srv.url})`
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.pushState({ error: `Connection error: ${errMsg}` });
        }
        break;
      }

      case 'createApiKey': {
        try {
          const apiKey = await this.cloudService.createApiKey(msg.dbId, msg.keyName);
          this.postMessage({
            type: 'apiKeyCreated',
            dbId: msg.dbId,
            dbName: msg.keyName,
            apiKey,
          });
          await vscode.env.clipboard.writeText(apiKey);
          vscode.window.showInformationMessage(
            'New AxarDB Cloud API Key created and copied to clipboard.'
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.pushState({ error: errMsg });
        }
        break;
      }

      case 'createDatabase': {
        try {
          await this.pushState({ loading: true });
          const created = await this.cloudService.createDatabase(
            msg.name,
            msg.subdomain,
            msg.plan
          );
          if (created.initialApiKey) {
            await this.cloudService.connectDatabaseToExtension(
              {
                dbId: created.database.id,
                name: created.database.name,
                subdomain: created.database.subdomain,
                apiKey: created.initialApiKey,
              },
              this.connectionManager
            );
          }
          await this.pushState({
            info: `✅ Created '${created.database.name}' (${created.database.subdomain}.axardb.com)!`,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.pushState({ error: errMsg });
        }
        break;
      }

      case 'copyText': {
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage(
          msg.label ? `${msg.label} copied to clipboard.` : 'Copied to clipboard.'
        );
        break;
      }

      case 'openExternal': {
        if (msg.url.startsWith('https://')) {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        break;
      }
    }
  }

  private postMessage(msg: HostToCloud): void {
    this._panel?.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'cloud.js')
    );
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'shared', 'theme.css')
    );
    const cloudCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'cloud', 'cloud.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCssUri}">
  <link rel="stylesheet" href="${cloudCssUri}">
  <title>AxarDB Cloud</title>
</head>
<body>
  <div id="cloud-app" class="cloud-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
