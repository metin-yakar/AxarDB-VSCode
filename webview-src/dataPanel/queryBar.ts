import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';
import { highlightAxarQuery } from '../shared/queryHighlight.js';
import { AutocompleteController } from './autocomplete.js';

export class QueryBar {
  private container: HTMLElement;
  private isScriptExpanded = false;
  private collapseTimeout: ReturnType<typeof setTimeout> | null = null;
  private autocompleteController: AutocompleteController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    if (this.autocompleteController) {
      this.autocompleteController.destroy();
      this.autocompleteController = null;
    }

    const state = store.getState();
    this.container.innerHTML = '';
    this.container.className = 'query-bar';
    this.container.style.position = 'relative';
    this.container.style.display = 'flex';
    this.container.style.alignItems = this.isScriptExpanded ? 'flex-start' : 'center';
    this.container.style.gap = '8px';
    this.container.style.padding = '6px 10px';
    this.container.style.borderBottom = '1px solid var(--border-color)';
    this.container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    // Filter label
    const filterLabel = document.createElement('span');
    filterLabel.style.fontSize = '11px';
    filterLabel.style.fontWeight = '600';
    filterLabel.style.color = 'var(--vscode-descriptionForeground)';
    filterLabel.style.marginTop = this.isScriptExpanded ? '6px' : '0';
    filterLabel.textContent = 'Filter:';
    this.container.appendChild(filterLabel);

    const colName = state.collection || 'users';
    const currentScript =
      state.queryScript && state.queryScript.trim().length > 0
        ? state.queryScript
        : `db.${colName}.findall(x => true).skip(${state.skip || 0}).take(${state.pageSize || 50})`;

    if (!this.isScriptExpanded) {
      // -------------------------------------------------------------
      // NORMAL STATE: Filter input + syntax-highlighted compact script pill
      // -------------------------------------------------------------
      const predicateInput = document.createElement('input');
      predicateInput.id = 'query-predicate-input';
      predicateInput.type = 'text';
      predicateInput.style.flex = '1';
      predicateInput.style.height = '26px';
      predicateInput.placeholder = 'e.g. x => x.age > 25 (Enter to filter)';
      predicateInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.runFilter(predicateInput.value);
        }
      };
      this.container.appendChild(predicateInput);

      // Attach autocomplete to filter input for table columns
      this.autocompleteController = new AutocompleteController(predicateInput, this.container, {
        isFilterOnly: true,
      });

      // Small compact script area beside the filter input with syntax highlight
      const scriptPill = document.createElement('div');
      scriptPill.id = 'query-script-pill';
      scriptPill.style.height = '26px';
      scriptPill.style.lineHeight = '24px';
      scriptPill.style.maxWidth = '360px';
      scriptPill.style.minWidth = '180px';
      scriptPill.style.padding = '0 10px';
      scriptPill.style.backgroundColor = 'var(--vscode-input-background, #1e1e1e)';
      scriptPill.style.border = '1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.15))';
      scriptPill.style.borderRadius = '3px';
      scriptPill.style.fontFamily = 'var(--font-mono)';
      scriptPill.style.fontSize = '11px';
      scriptPill.style.whiteSpace = 'nowrap';
      scriptPill.style.overflow = 'hidden';
      scriptPill.style.textOverflow = 'ellipsis';
      scriptPill.style.cursor = 'pointer';
      scriptPill.style.boxSizing = 'border-box';
      scriptPill.title = 'Click to expand query textarea (replaces filter input with 6 rows)';
      scriptPill.innerHTML = highlightAxarQuery(currentScript);

      scriptPill.onclick = () => {
        this.isScriptExpanded = true;
        this.render();
      };
      this.container.appendChild(scriptPill);

      // Filter button
      const runBtn = document.createElement('button');
      runBtn.id = 'query-run-btn';
      runBtn.textContent = 'Filter';
      runBtn.onclick = () => {
        this.runFilter(predicateInput.value);
      };
      this.container.appendChild(runBtn);
    } else {
      // -------------------------------------------------------------
      // EXPANDED STATE: The textarea replaces the filter input!
      // Enine (horizontally): flex: 1 (occupies the exact filter input width)
      // Dikeyde (vertically): at least 6 rows (rows="6", min-height: 120px)
      // With live syntax highlighting overlay + AxarDB Autocomplete!
      // -------------------------------------------------------------
      const editorWrapper = document.createElement('div');
      editorWrapper.className = 'ax-editor-container';
      editorWrapper.style.flex = '1';
      editorWrapper.style.position = 'relative';
      editorWrapper.style.minHeight = '120px';
      editorWrapper.style.borderRadius = '3px';
      editorWrapper.style.border = '1px solid var(--vscode-focusBorder, #007fd4)';
      editorWrapper.style.backgroundColor = 'var(--vscode-input-background, #1e1e1e)';
      editorWrapper.style.overflow = 'hidden';

      // Syntax highlight backdrop layer
      const backdrop = document.createElement('pre');
      backdrop.className = 'ax-highlight-backdrop';
      backdrop.innerHTML = highlightAxarQuery(currentScript);
      editorWrapper.appendChild(backdrop);

      // Transparent interactive textarea layer
      const textarea = document.createElement('textarea');
      textarea.id = 'query-script-textarea';
      textarea.rows = 6;
      textarea.value = currentScript;
      textarea.style.position = 'relative';
      textarea.style.width = '100%';
      textarea.style.minHeight = '120px';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.45';
      textarea.style.padding = '6px 8px';
      textarea.style.backgroundColor = 'transparent';
      textarea.style.color = 'transparent';
      textarea.style.caretColor = 'var(--vscode-editorCursor-foreground, #ffffff)';
      textarea.style.border = 'none';
      textarea.style.resize = 'vertical';
      textarea.style.boxSizing = 'border-box';
      textarea.style.outline = 'none';
      textarea.style.whiteSpace = 'pre-wrap';
      textarea.style.wordBreak = 'break-all';

      const syncHighlight = () => {
        backdrop.innerHTML = highlightAxarQuery(textarea.value) + (textarea.value.endsWith('\n') ? ' ' : '');
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
      };

      textarea.addEventListener('input', syncHighlight);
      textarea.addEventListener('scroll', () => {
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
      });

      // Keydown handling: Ctrl+Enter to run, Escape to collapse
      textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.runAdvanced(textarea.value);
          this.isScriptExpanded = false;
          this.render();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.isScriptExpanded = false;
          this.render();
        }
      };

      // Blur / Focusout handling: collapses back when focus moves outside
      textarea.addEventListener('blur', () => {
        this.collapseTimeout = setTimeout(() => {
          this.isScriptExpanded = false;
          this.render();
        }, 180);
      });

      editorWrapper.appendChild(textarea);
      this.container.appendChild(editorWrapper);

      // Attach autocomplete to expanded query textarea
      this.autocompleteController = new AutocompleteController(textarea, this.container, {
        onSelect: () => syncHighlight(),
      });

      // Run button
      const runBtn = document.createElement('button');
      runBtn.id = 'query-run-btn';
      runBtn.textContent = '▶ Run';
      runBtn.title = 'Run Query (Ctrl+Enter)';
      runBtn.style.backgroundColor = 'var(--vscode-button-background)';
      runBtn.style.color = 'var(--vscode-button-foreground)';
      runBtn.style.marginTop = '2px';

      runBtn.addEventListener('mousedown', () => {
        if (this.collapseTimeout) {
          clearTimeout(this.collapseTimeout);
          this.collapseTimeout = null;
        }
      });

      runBtn.onclick = () => {
        this.runAdvanced(textarea.value);
        this.isScriptExpanded = false;
        this.render();
      };

      this.container.appendChild(runBtn);

      // Focus the textarea immediately
      setTimeout(() => {
        textarea.focus();
        textarea.select();
        syncHighlight();
      }, 30);
    }
  }

  private runFilter(predicate: string): void {
    const state = store.getState();
    postMessageToHost<PanelToHost>({
      type: 'loadPage',
      req: {
        filter: predicate.trim() ? predicate.trim() : undefined,
        skip: 0,
        take: state.pageSize,
      },
    });
  }

  private runAdvanced(script: string): void {
    if (!script.trim()) return;
    postMessageToHost<PanelToHost>({
      type: 'runQuery',
      script: script.trim(),
    });
  }
}
