import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class QueryBar {
  private container: HTMLElement;
  private isScriptExpanded = false;
  private collapseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
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
      // NORMAL STATE: Filter input + small compact script input beside it
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

      // Small compact script area beside the filter input
      const scriptInput = document.createElement('input');
      scriptInput.id = 'query-script-pill';
      scriptInput.type = 'text';
      scriptInput.readOnly = true;
      scriptInput.value = currentScript;
      scriptInput.title = 'Click to expand query textarea (replaces filter input with 6 rows)';
      scriptInput.style.width = '240px';
      scriptInput.style.height = '26px';
      scriptInput.style.cursor = 'pointer';
      scriptInput.style.fontFamily = 'var(--font-mono)';
      scriptInput.style.fontSize = '11px';
      scriptInput.style.color = 'var(--vscode-symbolIcon-stringForeground, #ce9178)';
      scriptInput.onclick = () => {
        this.isScriptExpanded = true;
        this.render();
      };
      this.container.appendChild(scriptInput);

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
      // EXPANDED STATE: The textarea itself replaces the filter input!
      // Enine (horizontally): flex: 1 (occupies the exact filter input width)
      // Dikeyde (vertically): at least 6 rows (rows="6", min-height: 120px)
      // No popup window, no modal header, no floating dialog chrome.
      // -------------------------------------------------------------
      const textarea = document.createElement('textarea');
      textarea.id = 'query-script-textarea';
      textarea.rows = 6;
      textarea.value = currentScript;
      textarea.style.flex = '1';
      textarea.style.minHeight = '120px';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.45';
      textarea.style.padding = '6px 8px';
      textarea.style.backgroundColor = 'var(--vscode-input-background, #1e1e1e)';
      textarea.style.color = 'var(--vscode-input-foreground, #cccccc)';
      textarea.style.border = '1px solid var(--vscode-focusBorder, #007fd4)';
      textarea.style.borderRadius = '3px';
      textarea.style.resize = 'vertical';
      textarea.style.boxSizing = 'border-box';
      textarea.style.outline = 'none';

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

      this.container.appendChild(textarea);

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
