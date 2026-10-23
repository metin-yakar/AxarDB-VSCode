import * as vscode from 'vscode';
import {
  CollectionKind,
  DataViewMode,
  Doc,
  PageRequest,
  QueryResult,
  ServerId,
} from '../../contracts/types.js';
import {
  IAxarClient,
  IQueryBuilder,
  IHistoryStore,
  IExportService,
} from '../../contracts/services.js';
import { PanelToHost, HostToPanel } from '../../contracts/messages.js';
import { getNonce } from '../../util/nonce.js';
import { Logger } from '../../util/logger.js';

export interface DataPanelOptions {
  serverId: ServerId;
  serverName: string;
  collection: string;
  kind: CollectionKind;
  initialScript?: string;
}

export class DataPanelController implements vscode.Disposable {
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _rowCache: Doc[] = [];
  private _readOnly = false;
  private _pageSize = 50;
  private _mode: DataViewMode = 'grid';

  constructor(
    private readonly extensionUri: vscode.Uri,
    public readonly options: DataPanelOptions,
    private readonly client: IAxarClient,
    private readonly queryBuilder: IQueryBuilder,
    private readonly historyStore: IHistoryStore,
    private readonly exportService: IExportService,
    onDidDispose: () => void
  ) {
    this._readOnly = options.kind === 'memory' || options.kind === 'bulk' || options.kind === 'log';

    const config = vscode.workspace.getConfiguration('axardb.dataView');
    this._mode = config.get<DataViewMode>('defaultMode') || 'grid';
    this._pageSize = config.get<number>('pageSize') || 50;

    this._panel = vscode.window.createWebviewPanel(
      'axardb.dataPanel',
      `${options.collection} — ${options.serverName}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [extensionUri],
      }
    );

    this._panel.onDidDispose(() => {
      onDidDispose();
      this.dispose();
    }, null, this._disposables);

    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(async (msg: PanelToHost) => {
      await this.handleMessage(msg);
    }, null, this._disposables);
  }

  public reveal(): void {
    this._panel.reveal();
  }

  public getRow(rowIndex: number): Doc | undefined {
    return this._rowCache[rowIndex];
  }

  public setQuery(script: string, run = false): void {
    this.postMessage({ type: 'setQuery', script, run });
  }

  private async handleMessage(msg: PanelToHost): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        let collections: string[] = [this.options.collection];
        try {
          const cats = await this.client.listCategories(this.options.serverId);
          for (const cat of cats) {
            for (const item of cat.items) {
              if (!collections.includes(item.name)) {
                collections.push(item.name);
              }
            }
          }
        } catch {
          // Fallback to active collection
        }

        this.postMessage({
          type: 'init',
          serverName: this.options.serverName,
          collection: this.options.collection,
          kind: this.options.kind,
          mode: this._mode,
          pageSize: this._pageSize,
          readOnly: this._readOnly,
          initialScript: this.options.initialScript,
          collections,
        });
        await this.loadPage({ skip: 0, take: this._pageSize });
        break;
      }

      case 'loadPage':
        await this.loadPage(msg.req);
        break;

      case 'runQuery':
        await this.runCustomQuery(msg.script);
        break;

      case 'cellEdit':
        await this.handleCellEdit(msg.rowIndex, msg.field, msg.value, msg.oldValue);
        break;

      case 'saveDoc':
        await this.handleSaveDoc(msg.rowIndex, msg.doc);
        break;

      case 'requestHistory':
        {
          const entries = this.historyStore.list(this.options.serverId, { collection: this.options.collection });
          this.postMessage({ type: 'history', entries });
        }
        break;

      case 'export':
        await this.handleExport(msg);
        break;

      case 'setMode':
        this._mode = msg.mode;
        break;

      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('Copied to clipboard');
        break;
    }
  }

  private async loadPage(req: Omit<PageRequest, 'collection' | 'kind'>): Promise<void> {
    this.postMessage({ type: 'loading', on: true });

    try {
      const pageReq: PageRequest = {
        collection: this.options.collection,
        kind: this.options.kind,
        ...req,
      };

      const { script, countScript, params } = this.queryBuilder.page(pageReq);

      const [queryRes, countRes] = await Promise.all([
        this.client.query({
          serverId: this.options.serverId,
          script,
          params: params as Record<string, string | number | boolean>,
        }),
        this.client.query({
          serverId: this.options.serverId,
          script: countScript,
          params: params as Record<string, string | number | boolean>,
        }),
      ]);

      if (!queryRes.ok) {
        throw new Error(queryRes.error?.detail || queryRes.error?.message || 'Query failed');
      }

      this._rowCache = queryRes.docs || [];
      let displayScript = script;
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          displayScript = displayScript.split(`@${key}`).join(String(val));
        }
      }

      const total = typeof countRes.data === 'number' ? countRes.data : this._rowCache.length;

      this.postMessage({
        type: 'page',
        result: {
          docs: this._rowCache,
          total,
          skip: req.skip,
          take: req.take,
          elapsedMs: queryRes.elapsedMs,
          script: displayScript,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', message: msg });
    }
  }

  private async runCustomQuery(script: string): Promise<void> {
    this.postMessage({ type: 'loading', on: true });

    try {
      const res = await this.client.query({
        serverId: this.options.serverId,
        script,
      });

      if (res.ok) {
        if (res.docs) {
          this._rowCache = res.docs;
        } else if (Array.isArray(res.data)) {
          this._rowCache = res.data.map((item, idx) =>
            typeof item === 'object' && item !== null ? (item as Doc) : { _id: String(idx), value: item }
          );
        } else if (res.data !== null && res.data !== undefined) {
          if (typeof res.data === 'object') {
            this._rowCache = [res.data as Doc];
          } else {
            this._rowCache = [{ _id: 'result', value: res.data }];
          }
        } else {
          this._rowCache = [];
        }
      }

      await this.historyStore
        .add({
          serverId: this.options.serverId,
          collection: this.options.collection,
          script,
          executedAt: res.executedAt,
          elapsedMs: res.elapsedMs,
          ok: res.ok,
          rowCount: this._rowCache ? this._rowCache.length : undefined,
        })
        .catch((err) => Logger.error('Failed to add query to history', err));

      this.postMessage({ type: 'queryResult', result: res });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', message: msg });
    } finally {
      this.postMessage({ type: 'loading', on: false });
    }
  }

  private async handleCellEdit(rowIndex: number, field: string, value: unknown, oldValue: unknown): Promise<void> {
    const doc = this._rowCache[rowIndex];
    if (!doc || !doc._id) {
      this.postMessage({
        type: 'editRejected',
        rowIndex,
        field,
        oldValue,
        error: 'Cannot update document without _id',
      });
      return;
    }

    try {
      const { script, params } = this.queryBuilder.updateById(this.options.collection, doc._id, {
        [field]: value,
      });

      const res = await this.client.query({
        serverId: this.options.serverId,
        script,
        params,
      });

      if (!res.ok) {
        throw new Error(res.error?.detail || res.error?.message || 'Update failed');
      }

      // Update in memory cache
      (doc as Record<string, unknown>)[field] = value;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({
        type: 'editRejected',
        rowIndex,
        field,
        oldValue,
        error: msg,
      });
    }
  }

  private async handleSaveDoc(rowIndex: number | null, doc: Doc): Promise<void> {
    this.postMessage({ type: 'loading', on: true });

    try {
      if (rowIndex === null) {
        // Insert
        const script = this.queryBuilder.insert(this.options.collection, doc);
        const res = await this.client.query({
          serverId: this.options.serverId,
          script,
        });
        if (!res.ok) throw new Error(res.error?.detail || res.error?.message || 'Insert failed');
      } else {
        // Replace / Update
        const targetDoc = this._rowCache[rowIndex];
        if (!targetDoc || !targetDoc._id) {
          throw new Error('Cannot update document without _id');
        }
        const { script, params } = this.queryBuilder.replaceById(this.options.collection, targetDoc._id, doc);
        const res = await this.client.query({
          serverId: this.options.serverId,
          script,
          params,
        });
        if (!res.ok) throw new Error(res.error?.detail || res.error?.message || 'Update failed');
      }

      this.postMessage({ type: 'docSaved', rowIndex, doc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postMessage({ type: 'error', message: msg });
    }
  }

  private async handleExport(msg: Extract<PanelToHost, { type: 'export' }>): Promise<void> {
    try {
      if (msg.scope === 'collection') {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Exporting ${this.options.collection}...`,
            cancellable: true,
          },
          async (progress, token) => {
            await this.exportService.exportCollection(
              this.options.serverId,
              this.options.collection,
              msg.format,
              progress,
              token
            );
          }
        );
      } else {
        const docsToExport =
          msg.scope === 'selection' && msg.rowIndexes && msg.rowIndexes.length > 0
            ? msg.rowIndexes.map((idx) => this._rowCache[idx]).filter((d): d is Doc => d !== undefined)
            : this._rowCache;

        await this.exportService.exportDocs(
          docsToExport,
          msg.format,
          `${this.options.collection}-${msg.scope}`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${msg}`);
    }
  }

  private postMessage(msg: HostToPanel): void {
    this._panel.webview.postMessage(msg);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'dataPanel.js'));
    const sharedCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'shared', 'theme.css'));
    const gridCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-src', 'dataPanel', 'grid.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${sharedCssUri}">
  <link rel="stylesheet" href="${gridCssUri}">
  <title>${this.options.collection}</title>
</head>
<body style="display:flex; flex-direction:column; height:100vh; overflow:hidden;">
  <div id="toolbar-container"></div>
  <div id="querybar-container"></div>
  <div id="error-banner" style="display:none; padding:6px 12px; background:var(--vscode-inputValidation-errorBackground, #5a1d1d); color:var(--vscode-inputValidation-errorForeground, #fff); font-size:12px;"></div>
  <div id="main-content" style="display:flex; flex:1; overflow:hidden; position:relative;">
    <div id="grid-container" class="grid-wrapper"></div>
    <div id="splitter" class="splitter"></div>
    <div id="sidepanel-container" style="width:320px; flex-shrink:0; background:var(--vscode-sideBar-background); border-left:1px solid var(--border-color); overflow:hidden; display:flex; flex-direction:column;"></div>
    <div id="loading-overlay" class="modal-overlay" style="display:none; background:rgba(0,0,0,0.25);">
      <div style="padding:12px 20px; background:var(--vscode-editor-background); border-radius:4px; font-size:13px; display:flex; gap:8px; align-items:center;">
        <span>Loading...</span>
      </div>
    </div>
  </div>
  <div id="pager-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
