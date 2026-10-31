import * as vscode from 'vscode';
import { DocsToHost, HostToDocs } from '../../contracts/messages.js';
import { getNonce } from '../../util/nonce.js';

export class DocumentationViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'axardb.documentation';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onOpenTopic?: (topicId: string, highlightTerms?: string[]) => void,
    private readonly onOpenInPlayground?: (code: string) => Promise<void>
  ) {}

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

    webviewView.webview.onDidReceiveMessage(async (msg: DocsToHost) => {
      await this.handleMessage(msg);
    });
  }

  public focusSearch(): void {
    this.postMessage({ type: 'focusSearch' });
  }

  public expandAll(): void {
    this.postMessage({ type: 'expandAll' });
  }

  public collapseAll(): void {
    this.postMessage({ type: 'collapseAll' });
  }

  public selectTopic(topicId: string): void {
    this.postMessage({ type: 'selectTopic', topicId });
  }

  private async handleMessage(msg: DocsToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        break;

      case 'openTopic':
        this.onOpenTopic?.(msg.topicId, msg.highlightTerms);
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
    this._view?.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'documentation.js')
    );
    const sharedCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'shared', 'theme.css')
    );
    const docsCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'documentation', 'docs.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCssUri}">
  <link rel="stylesheet" href="${docsCssUri}">
  <title>AxarDB Documentation</title>
</head>
<body>
  <div id="docs-app" class="docs-container">
    <div class="docs-search-header">
      <div class="docs-search-row">
        <div class="docs-search-input-wrapper">
          <span class="docs-search-icon" aria-hidden="true">🔍</span>
          <input
            type="text"
            id="docs-global-search"
            placeholder="General search in docs..."
            aria-label="General search in AxarDB documentation"
            title="Search across all categories, topics, and code examples"
            spellcheck="false"
            autocomplete="off"
          />
          <button
            id="docs-search-clear"
            class="icon-btn docs-clear-btn"
            title="Clear search (Esc)"
            aria-label="Clear search"
          >✕</button>
        </div>
        <button
          id="docs-toggle-advanced"
          class="icon-btn docs-filter-toggle-btn"
          title="Specific / Scoped Search Filters (Category & Target)"
          aria-label="Toggle Specific Search Filters"
          aria-expanded="false"
        >⚙️</button>
      </div>

      <div id="docs-scoped-bar" class="docs-scoped-bar" hidden>
        <div class="docs-filter-group">
          <label for="docs-category-select" class="docs-filter-label">Category:</label>
          <select
            id="docs-category-select"
            class="docs-select"
            title="Filter by main category"
            aria-label="Filter by main category"
          >
            <option value="all">All Categories (Global)</option>
            <option value="getting-started">Getting Started</option>
            <option value="javascript-api">JavaScript API</option>
            <option value="advanced">Advanced</option>
            <option value="http-security">HTTP &amp; Security</option>
            <option value="sdks-tools">SDKs &amp; Tools</option>
            <option value="reference">Reference</option>
          </select>
        </div>

        <div class="docs-scope-pills" role="group" aria-label="Search target scope">
          <button type="button" id="scope-btn-all" class="scope-pill active" data-scope="all" title="Search in titles, descriptions, tables, and code" aria-label="Search all fields">All</button>
          <button type="button" id="scope-btn-title" class="scope-pill" data-scope="title" title="Search only in topic titles and keywords" aria-label="Search titles only">Titles</button>
          <button type="button" id="scope-btn-code" class="scope-pill" data-scope="code" title="Search only in code examples" aria-label="Search code examples only">Code</button>
          <button type="button" id="scope-btn-content" class="scope-pill" data-scope="content" title="Search only in descriptions and tables" aria-label="Search text and tables only">Content</button>
        </div>
      </div>

      <div id="docs-search-summary" class="docs-search-summary" hidden></div>
    </div>

    <div id="docs-accordion-root" class="docs-accordion-root" role="tree" aria-label="AxarDB Documentation Categories"></div>

    <div id="docs-empty-state" class="docs-empty-state" hidden>
      <p>No documentation topics match your search criteria.</p>
      <button id="docs-reset-filters-btn" class="btn secondary" title="Reset all search filters" aria-label="Reset all search filters">Reset Search</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
