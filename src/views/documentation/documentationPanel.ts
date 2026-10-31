import * as vscode from 'vscode';
import { DocsToHost, HostToDocs } from '../../contracts/messages.js';
import { AXAR_DOCS_CATALOG } from '../../docs/axarDocsCatalog.js';
import { getNonce } from '../../util/nonce.js';

export class DocumentationPanel implements vscode.Disposable {
  public static readonly viewType = 'axardb.documentationPanel';

  private _panel?: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _currentTopicId = 'overview';
  private _currentHighlightTerms: string[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onOpenInPlayground?: (code: string) => Promise<void>,
    private readonly onDidSelectTopic?: (topicId: string) => void
  ) {}

  public showTopic(topicId: string, highlightTerms?: string[]): void {
    this._currentTopicId = topicId;
    this._currentHighlightTerms = highlightTerms ?? [];

    const topicTitle = this.findTopicTitle(topicId);

    if (this._panel) {
      this._panel.title = `AxarDB Docs: ${topicTitle}`;
      this._panel.reveal(vscode.ViewColumn.Active);
      this.postMessage({
        type: 'selectTopic',
        topicId: this._currentTopicId,
        highlightTerms: this._currentHighlightTerms,
      });
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      DocumentationPanel.viewType,
      `AxarDB Docs: ${topicTitle}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    this._panel.onDidDispose(
      () => {
        this._panel = undefined;
        this.clearDisposables();
      },
      null,
      this._disposables
    );

    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(
      async (msg: DocsToHost) => {
        await this.handleMessage(msg);
      },
      null,
      this._disposables
    );
  }

  private findTopicTitle(topicId: string): string {
    for (const cat of AXAR_DOCS_CATALOG) {
      const found = cat.topics.find((t) => t.id === topicId);
      if (found) return found.title;
    }
    return 'Documentation';
  }

  private async handleMessage(msg: DocsToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postMessage({
          type: 'selectTopic',
          topicId: this._currentTopicId,
          highlightTerms: this._currentHighlightTerms,
        });
        break;

      case 'openTopic':
        this._currentTopicId = msg.topicId;
        this._currentHighlightTerms = msg.highlightTerms ?? [];
        if (this._panel) {
          this._panel.title = `AxarDB Docs: ${this.findTopicTitle(msg.topicId)}`;
        }
        this.onDidSelectTopic?.(msg.topicId);
        break;

      case 'copyCode':
        await vscode.env.clipboard.writeText(msg.code);
        vscode.window.showInformationMessage(vscode.l10n.t('Code snippet copied to clipboard.'));
        break;

      case 'openInPlayground':
        if (this.onOpenInPlayground) {
          await this.onOpenInPlayground(msg.code);
        } else {
          const doc = await vscode.workspace.openTextDocument({
            language: 'javascript',
            content: msg.code,
          });
          await vscode.window.showTextDocument(doc);
        }
        break;
    }
  }

  private postMessage(msg: HostToDocs): void {
    this._panel?.webview.postMessage(msg);
  }

  private clearDisposables(): void {
    while (this._disposables.length > 0) {
      const d = this._disposables.pop();
      d?.dispose();
    }
  }

  public dispose(): void {
    this._panel?.dispose();
    this._panel = undefined;
    this.clearDisposables();
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'documentationViewer.js')
    );
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'theme.css')
    );
    const viewerCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'viewer.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCssUri}">
  <link rel="stylesheet" href="${viewerCssUri}">
  <title>AxarDB Documentation</title>
</head>
<body>
  <div id="doc-viewer-app" class="doc-viewer-container">
    <header class="doc-viewer-topbar">
      <div id="doc-viewer-breadcrumb" class="doc-viewer-breadcrumb"></div>
      <div class="doc-viewer-local-search">
        <span class="doc-viewer-search-icon" aria-hidden="true">🔍</span>
        <input
          type="text"
          id="doc-viewer-search-input"
          placeholder="Search inside this document..."
          title="Specific search within the active topic document"
          aria-label="Search inside this document"
          spellcheck="false"
          autocomplete="off"
        />
        <span id="doc-viewer-match-count" class="doc-viewer-match-count" hidden></span>
        <button
          type="button"
          id="doc-viewer-search-clear"
          class="icon-btn doc-viewer-clear-btn"
          title="Clear in-document search (Esc)"
          aria-label="Clear in-document search"
          hidden
        >✕</button>
      </div>
    </header>

    <main id="doc-viewer-content" class="doc-viewer-content" tabindex="0"></main>

    <footer id="doc-viewer-footer" class="doc-viewer-footer"></footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

