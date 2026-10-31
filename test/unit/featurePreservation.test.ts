// @vitest-environment jsdom
import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxarCodeLensProvider } from '../../src/editor/codeLens.js';

describe('Feature Preservation & Non-Regression Guardrails', () => {
  const sentMessages: unknown[] = [];
  let webviewState: unknown = {};

  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: (msg: unknown) => sentMessages.push(msg),
    getState: () => webviewState,
    setState: (st: unknown) => {
      webviewState = st;
    },
  });

  beforeEach(() => {
    sentMessages.length = 0;
    webviewState = {};
  });

  it('preserves the official AxarDB Hexagon + Stylized A + Database Arcs logo in media/icons/axardb.svg', () => {
    const svgPath = path.resolve(__dirname, '../../media/icons/axardb.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf-8');

    expect(svgContent).toContain('<svg');
    // Must contain the Hexagon frame and Stylized 'A' paths, not the old generic 3-cylinder ellipse
    expect(svgContent).not.toContain('<ellipse');
    expect(svgContent).toContain('AxarDB');
    expect(svgContent.match(/<path/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('enforces Playground Run button, Ctrl+Enter keybinding (editorLangId == javascript), and unlocked webview/context menus in package.json', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      contributes: {
        viewsContainers: { activitybar: Array<{ id: string; icon: string }> };
        menus: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
        keybindings: Array<{ command: string; key: string; when: string }>;
      };
    };

    // 1. Activity bar uses media/icons/axardb.svg
    expect(pkg.contributes.viewsContainers.activitybar[0]?.icon).toBe('media/icons/axardb.svg');

    // 2. All 6 webview stylesheets exist in dist/webview for packaging
    const distWebviewDir = path.resolve(__dirname, '../../dist/webview');
    const requiredStyles = ['theme.css', 'tree.css', 'grid.css', 'docs.css', 'viewer.css', 'cloud.css'];
    for (const styleFile of requiredStyles) {
      expect(fs.existsSync(path.join(distWebviewDir, styleFile))).toBe(true);
    }

    // 3. Editor title has Run AxarDB Query button supporting untitled JS editors (editorLangId == javascript)
    const editorTitleRun = pkg.contributes.menus['editor/title']?.find(
      (m) => m.command === 'axardb.query.run'
    );
    expect(editorTitleRun).toBeDefined();
    expect(editorTitleRun?.when).toContain('editorLangId == javascript');

    // 3. Ctrl+Enter keybinding supports editorLangId == javascript
    const ctrlEnter = pkg.contributes.keybindings.find(
      (k) => k.command === 'axardb.query.run' && k.key === 'ctrl+enter'
    );
    expect(ctrlEnter).toBeDefined();
    expect(ctrlEnter?.when).toContain('editorLangId == javascript');

    // 4. webview/context items do NOT lock out WebviewViews via webviewId == 'axardb.connections'
    const webviewContext = pkg.contributes.menus['webview/context'] || [];
    expect(webviewContext.length).toBeGreaterThan(10);
    for (const item of webviewContext) {
      expect(item.when).not.toContain("webviewId == 'axardb.connections'");
    }
  });

  it('renders CodeLens ▶ Run AxarDB Query (Ctrl+Enter) on Playground and AxarDB JS documents', () => {
    vi.mock('vscode', () => ({
      EventEmitter: class {
        public event = () => ({ dispose: () => {} });
        public fire() {}
      },
      Range: class {
        constructor(public start: unknown, public end: unknown) {}
      },
      CodeLens: class {
        constructor(public range: unknown, public command: unknown) {}
      },
    }));

    const provider = new AxarCodeLensProvider();
    const fakeDoc = {
      isUntitled: true,
      lineCount: 3,
      getText: () =>
        '// @axardb server=srv_1 collection=users\ndb.users.findall(x => true).take(50);\n',
      lineAt: (idx: number) => ({
        text:
          idx === 0
            ? '// @axardb server=srv_1 collection=users'
            : 'db.users.findall(x => true).take(50);',
        range: { start: { line: idx, character: 0 }, end: { line: idx, character: 36 } },
      }),
    };

    const lenses = provider.provideCodeLenses(fakeDoc as never, {} as never);
    expect(lenses.length).toBe(1);
    expect(lenses[0]?.command?.command).toBe('axardb.query.run');
    expect(lenses[0]?.command?.title).toContain('Run AxarDB Query');
  });

  it('prevents default Copy/Paste menu and shows rich right-click database context menu on Server, Category, and Collection nodes', async () => {
    document.body.innerHTML = `
      <div id="app" class="tree-container" data-vscode-context='{"preventDefaultContextMenuItems": true}'>
        <div class="filter-bar">
          <div class="filter-input-wrapper">
            <input type="text" id="filter-input" />
            <button id="filter-clear" class="filter-clear-btn">✕</button>
          </div>
          <button id="refresh-all-btn" class="filter-refresh-btn" type="button">↻</button>
        </div>
        <div id="tree-root" class="tree-content" role="tree"></div>
        <div id="empty-state" class="empty-state" style="display: none;">
          <button id="add-server-btn" class="btn">Add Server</button>
          <button id="cloud-server-btn" class="btn secondary">☁️ AxarDB Cloud</button>
        </div>
        <div id="tree-context-menu" class="tree-context-menu" role="menu" style="display: none;"></div>
      </div>
    `;

    await import('../../webview-src/connections/main.js');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'state',
          servers: [
            {
              id: 'srv_ctx_1',
              name: 'my-test2',
              url: 'https://my-test2.axardb.com',
              username: 'apikey',
              isCloud: true,
              subdomain: 'my-test2',
              state: 'connected',
              categories: [
                {
                  kind: 'db',
                  label: 'DB',
                  items: [{ name: 'users', kind: 'db', count: 12 }],
                },
              ],
            },
          ],
        },
      })
    );

    const serverNode = document.querySelector('.server-node') as HTMLElement;
    const catNode = document.querySelector('.category-node') as HTMLElement;
    const colNode = document.querySelector('.collection-node') as HTMLElement;
    expect(serverNode).not.toBeNull();
    expect(catNode).not.toBeNull();
    expect(colNode).not.toBeNull();

    // 1. All nodes have preventDefaultContextMenuItems: true in data-vscode-context
    expect(JSON.parse(serverNode.getAttribute('data-vscode-context') || '{}').preventDefaultContextMenuItems).toBe(true);
    expect(JSON.parse(catNode.getAttribute('data-vscode-context') || '{}').preventDefaultContextMenuItems).toBe(true);
    expect(JSON.parse(colNode.getAttribute('data-vscode-context') || '{}').preventDefaultContextMenuItems).toBe(true);

    // 2. Right-clicking serverNode opens #tree-context-menu with Disconnect, Refresh Server, New AxarDB Playground, Edit Connection, Remove Connection
    serverNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }));
    const ctxMenu = document.getElementById('tree-context-menu') as HTMLElement;
    expect(ctxMenu.style.display).toBe('flex');
    expect(ctxMenu.textContent).toContain('Disconnect');
    expect(ctxMenu.textContent).toContain('Refresh Server');
    expect(ctxMenu.textContent).toContain('New AxarDB Playground');
    expect(ctxMenu.textContent).toContain('Edit Connection');
    expect(ctxMenu.textContent).toContain('Remove Connection');

    // 3. Right-clicking colNode opens #tree-context-menu with View Data, Query Templates, Export Collection, Collection Logs, Drop Collection
    colNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 120 }));
    expect(ctxMenu.style.display).toBe('flex');
    expect(ctxMenu.textContent).toContain('View Data');
    expect(ctxMenu.textContent).toContain('find(predicate)');
    expect(ctxMenu.textContent).toContain('insert({...})');
    expect(ctxMenu.textContent).toContain('Export as JSON Array...');
    expect(ctxMenu.textContent).toContain('All System Logs (syslogs)');
    expect(ctxMenu.textContent).toContain('Drop Collection');

    // Clicking "insert({...})" dispatches contextAction to Host
    const insertBtn = Array.from(ctxMenu.querySelectorAll<HTMLButtonElement>('.ctx-menu-item')).find(
      (b) => b.textContent?.includes('insert({...})')
    );
    expect(insertBtn).toBeDefined();
    insertBtn?.click();

    expect(sentMessages).toContainEqual({
      type: 'contextAction',
      command: 'axardb.collection.template.insert',
      arg: { serverId: 'srv_ctx_1', collection: 'users', kind: 'db' },
    });
  });
});

