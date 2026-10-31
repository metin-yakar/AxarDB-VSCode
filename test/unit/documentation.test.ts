// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  AXAR_DOCS_CATALOG,
  filterDocsCatalog,
  getTopicSearchableText,
  normalizeSearchText,
  countSubstringOccurrences,
} from '../../src/docs/axarDocsCatalog.js';
import { Commands } from '../../src/contracts/commands.js';

describe('AxarDB Documentation Catalog & Search Engine', () => {
  it('defines the 6 main documentation categories matching AxarDB docs', () => {
    const categoryIds = AXAR_DOCS_CATALOG.map((c) => c.id);
    expect(categoryIds).toEqual([
      'getting-started',
      'javascript-api',
      'advanced',
      'http-security',
      'sdks-tools',
      'reference',
    ]);

    for (const cat of AXAR_DOCS_CATALOG) {
      expect(cat.title.length).toBeGreaterThan(0);
      expect(cat.topics.length).toBeGreaterThan(0);
    }
  });

  it('registers documentation commands in Commands contract', () => {
    expect(Commands.DOCS_FOCUS_SEARCH).toBe('axardb.docs.focusSearch');
    expect(Commands.DOCS_EXPAND_ALL).toBe('axardb.docs.expandAll');
    expect(Commands.DOCS_COLLAPSE_ALL).toBe('axardb.docs.collapseAll');
  });

  it('normalizes Turkish characters for case-insensitive search', () => {
    expect(normalizeSearchText('İZMİR')).toBe('izmir');
    expect(normalizeSearchText('Iğdır')).toBe('iğdir');
    expect(countSubstringOccurrences('İstanbul ve İzmir', 'istan')).toBe(1);
    expect(countSubstringOccurrences('İZMİR', 'izmir')).toBe(1);
  });

  it('performs global search across all categories and topics', () => {
    const results = filterDocsCatalog({ globalQuery: 'guidv7CreatedAt' });
    expect(results.length).toBeGreaterThanOrEqual(1);

    const matchedIds = results.flatMap((c) => c.topics.map((t) => t.topic.id));
    expect(matchedIds).toContain('uuid-v7');
    expect(matchedIds).toContain('utilities');
  });

  it('performs specific category-scoped search (categoryId filter)', () => {
    const results = filterDocsCatalog({
      globalQuery: 'insert',
      categoryId: 'javascript-api',
    });

    expect(results.length).toBe(1);
    expect(results[0]?.category.id).toBe('javascript-api');
    const topicIds = results[0]?.topics.map((t) => t.topic.id) ?? [];
    expect(topicIds).toContain('data-write');
  });

  it('performs field-scoped search (title vs code vs content)', () => {
    // 'Compare' appears in Benchmark summary/title, while 'mysqlRead' appears in External DB code & title
    const codeOnly = filterDocsCatalog({
      globalQuery: 'pgsqlExec',
      fieldScope: 'code',
    });
    const codeTopicIds = codeOnly.flatMap((c) => c.topics.map((t) => t.topic.id));
    expect(codeTopicIds).toContain('external-db');

    const titleOnly = filterDocsCatalog({
      globalQuery: 'pgsqlExec',
      fieldScope: 'title',
    });
    const titleTopicIds = titleOnly.flatMap((c) => c.topics.map((t) => t.topic.id));
    // 'pgsqlExec' is in keywords of external-db
    expect(titleTopicIds).toContain('external-db');
  });

  it('performs inline category-specific search (categoryQueries)', () => {
    const results = filterDocsCatalog({
      categoryQueries: {
        advanced: 'syslogs',
      },
    });

    const advCat = results.find((r) => r.category.id === 'advanced');
    expect(advCat).toBeDefined();
    const advTopicIds = advCat?.topics.map((t) => t.topic.id) ?? [];
    expect(advTopicIds).toContain('syslogs');
    expect(advTopicIds).toContain('system-config');
    expect(advTopicIds).not.toContain('webhooks');
  });

  it('extracts searchable text by field scope accurately', () => {
    const jsCat = AXAR_DOCS_CATALOG.find((c) => c.id === 'javascript-api')!;
    const readTopic = jsCat.topics.find((t) => t.id === 'data-read')!;

    expect(getTopicSearchableText(readTopic, 'title')).toContain('Data Reading');
    expect(getTopicSearchableText(readTopic, 'code')).toContain('db.users.findall');
    expect(getTopicSearchableText(readTopic, 'content')).toContain('ResultSet');
  });

  it('renders accordion DOM and handles both general and specific searches interactively', async () => {
    const sentMessages: unknown[] = [];
    let webviewState: unknown = {};

    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: (msg: unknown) => sentMessages.push(msg),
      getState: () => webviewState,
      setState: (st: unknown) => {
        webviewState = st;
      },
    });

    document.body.innerHTML = `
      <div id="docs-app" class="docs-container">
        <div class="docs-search-header">
          <div class="docs-search-row">
            <div class="docs-search-input-wrapper">
              <span class="docs-search-icon" aria-hidden="true">🔍</span>
              <input type="text" id="docs-global-search" placeholder="General search in docs..." />
              <button id="docs-search-clear" class="icon-btn docs-clear-btn">✕</button>
            </div>
            <button id="docs-toggle-advanced" class="icon-btn docs-filter-toggle-btn" aria-expanded="false">⚙️</button>
          </div>
          <div id="docs-scoped-bar" class="docs-scoped-bar" hidden>
            <div class="docs-filter-group">
              <select id="docs-category-select" class="docs-select">
                <option value="all">All Categories (Global)</option>
                <option value="getting-started">Getting Started</option>
                <option value="javascript-api">JavaScript API</option>
                <option value="advanced">Advanced</option>
                <option value="http-security">HTTP &amp; Security</option>
                <option value="sdks-tools">SDKs &amp; Tools</option>
                <option value="reference">Reference</option>
              </select>
            </div>
            <div class="docs-scope-pills" role="group">
              <button type="button" id="scope-btn-all" class="scope-pill active" data-scope="all">All</button>
              <button type="button" id="scope-btn-title" class="scope-pill" data-scope="title">Titles</button>
              <button type="button" id="scope-btn-code" class="scope-pill" data-scope="code">Code</button>
              <button type="button" id="scope-btn-content" class="scope-pill" data-scope="content">Content</button>
            </div>
          </div>
          <div id="docs-search-summary" class="docs-search-summary" hidden></div>
        </div>
        <div id="docs-accordion-root" class="docs-accordion-root" role="tree"></div>
        <div id="docs-empty-state" class="docs-empty-state" hidden>
          <p>No documentation topics match your search criteria.</p>
          <button id="docs-reset-filters-btn" class="btn secondary">Reset Search</button>
        </div>
      </div>
      <div id="doc-viewer-app" class="doc-viewer-container">
        <header class="doc-viewer-topbar">
          <div id="doc-viewer-breadcrumb" class="doc-viewer-breadcrumb"></div>
          <div class="doc-viewer-local-search">
            <span class="doc-viewer-search-icon" aria-hidden="true">🔍</span>
            <input type="text" id="doc-viewer-search-input" placeholder="Search inside this document..." />
            <span id="doc-viewer-match-count" class="doc-viewer-match-count" hidden></span>
            <button type="button" id="doc-viewer-search-clear" class="icon-btn doc-viewer-clear-btn" hidden>✕</button>
          </div>
        </header>
        <main id="doc-viewer-content" class="doc-viewer-content" tabindex="0"></main>
        <footer id="doc-viewer-footer" class="doc-viewer-footer"></footer>
      </div>
    `;

    await import('../../webview-src/documentation/main.js');
    await import('../../webview-src/documentation/viewer.js');

    // 1. Verify ready message sent and 6 category accordions rendered
    expect(sentMessages).toContainEqual({ type: 'ready' });
    const catSections = document.querySelectorAll('.docs-category-section');
    expect(catSections.length).toBe(6);

    // 2. Test Global Search
    const globalSearch = document.getElementById('docs-global-search') as HTMLInputElement;
    globalSearch.value = 'UUID v7';
    globalSearch.dispatchEvent(new Event('input'));

    const visibleTopicsAfterGlobal = document.querySelectorAll('.docs-topic-item');
    expect(visibleTopicsAfterGlobal.length).toBeGreaterThanOrEqual(2);
    const marks = document.querySelectorAll('#docs-accordion-root mark.highlight-match');
    expect(marks.length).toBeGreaterThan(0);

    // Clear global search
    const clearBtn = document.getElementById('docs-search-clear') as HTMLButtonElement;
    clearBtn.click();
    expect(globalSearch.value).toBe('');

    // 3. Test Specific Category Filter + Field Scope Filter
    const toggleAdvanced = document.getElementById('docs-toggle-advanced') as HTMLButtonElement;
    toggleAdvanced.click();
    const scopedBar = document.getElementById('docs-scoped-bar') as HTMLDivElement;
    expect(scopedBar.hidden).toBe(false);

    const catSelect = document.getElementById('docs-category-select') as HTMLSelectElement;
    catSelect.value = 'advanced';
    catSelect.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('.docs-category-section').length).toBe(1);

    // 4. Test Category-inline Specific Search
    const advSearchBtn = document.getElementById('doc-cat-search-btn-advanced') as HTMLButtonElement;
    advSearchBtn.click();
    const advSearchInput = document.getElementById('doc-cat-search-input-advanced') as HTMLInputElement;
    expect(advSearchInput).not.toBeNull();
    advSearchInput.value = 'syslogs';
    advSearchInput.dispatchEvent(new Event('input'));

    const matchedTopicsInAdv = document.querySelectorAll('.docs-topic-item');
    expect(matchedTopicsInAdv.length).toBe(2); // syslogs & system-config

    // 5. Verify Sidebar Tree ONLY contains menu items (no inline document body in the tree)
    expect(document.querySelector('.docs-topic-body')).toBeNull();

    // 6. Clicking a topic in the sidebar selects it and posts 'openTopic' to open the Documentation Viewer Panel
    const syslogsTopicNode = document.getElementById('doc-topic-syslogs') as HTMLDivElement;
    expect(syslogsTopicNode).not.toBeNull();
    syslogsTopicNode.click();

    const updatedSyslogsNode = document.getElementById('doc-topic-syslogs') as HTMLDivElement;
    expect(updatedSyslogsNode.classList.contains('selected')).toBe(true);
    expect(
      sentMessages.some(
        (m) =>
          typeof m === 'object' &&
          m !== null &&
          (m as { type?: string; topicId?: string }).type === 'openTopic' &&
          (m as { type?: string; topicId?: string }).topicId === 'syslogs'
      )
    ).toBe(true);

    // 7. Test Documentation Viewer rendering when topic 'data-read' is selected
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'selectTopic', topicId: 'data-read', highlightTerms: [] },
      })
    );

    const titleEl = document.querySelector('.doc-viewer-title');
    expect(titleEl?.textContent).toContain('Data Reading');

    // Verify framed code block exists, has syntax highlighting spans, and has Copy + Playground buttons
    const codeFrame = document.querySelector('.doc-code-frame');
    expect(codeFrame).not.toBeNull();
    expect(codeFrame?.querySelector('.doc-code-lang-badge')?.textContent).toBe('JAVASCRIPT');

    const codePre = codeFrame?.querySelector('.doc-code-frame-pre code');
    expect(codePre?.innerHTML).toContain('class="ax-comment"');
    expect(codePre?.innerHTML).toContain('class="ax-root"');
    expect(codePre?.innerHTML).toContain('class="ax-method"');

    const copyBtn = codeFrame?.querySelector('.doc-code-copy-btn') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    copyBtn.click();
    expect(
      sentMessages.some(
        (m) => typeof m === 'object' && m !== null && (m as { type?: string }).type === 'copyCode'
      )
    ).toBe(true);

    const playBtn = codeFrame?.querySelector('.doc-code-play-btn') as HTMLButtonElement;
    expect(playBtn).not.toBeNull();
    playBtn.click();
    expect(
      sentMessages.some(
        (m) => typeof m === 'object' && m !== null && (m as { type?: string }).type === 'openInPlayground'
      )
    ).toBe(true);
  });
});
