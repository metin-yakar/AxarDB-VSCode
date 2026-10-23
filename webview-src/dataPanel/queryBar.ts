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
    this.container.style.alignItems = 'center';
    this.container.style.gap = '8px';
    this.container.style.padding = '6px 10px';
    this.container.style.borderBottom = '1px solid var(--border-color)';
    this.container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    // Filter label
    const filterLabel = document.createElement('span');
    filterLabel.style.fontSize = '11px';
    filterLabel.style.fontWeight = '600';
    filterLabel.style.color = 'var(--vscode-descriptionForeground)';
    filterLabel.textContent = 'Filter:';
    this.container.appendChild(filterLabel);

    // Filter & Script Wrapper (occupies the main horizontal space)
    const filterWrapper = document.createElement('div');
    filterWrapper.id = 'query-filter-wrapper';
    filterWrapper.style.flex = '1';
    filterWrapper.style.position = 'relative';
    filterWrapper.style.display = 'flex';
    filterWrapper.style.alignItems = 'center';
    filterWrapper.style.gap = '8px';

    const colName = state.collection || 'users';
    const currentScript =
      state.queryScript && state.queryScript.trim().length > 0
        ? state.queryScript
        : `db.${colName}.findall(x => true).skip(${state.skip || 0}).take(${state.pageSize || 50})`;

    if (!this.isScriptExpanded) {
      // 1. Normal state: Filter text input
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
      filterWrapper.appendChild(predicateInput);

      // 2. Beside it: Small compact script pill/area
      const compactPill = document.createElement('div');
      compactPill.id = 'query-script-pill';
      compactPill.style.height = '26px';
      compactPill.style.lineHeight = '24px';
      compactPill.style.maxWidth = '300px';
      compactPill.style.minWidth = '160px';
      compactPill.style.padding = '0 10px';
      compactPill.style.backgroundColor = 'var(--vscode-input-background)';
      compactPill.style.border = '1px solid var(--vscode-input-border, var(--border-color))';
      compactPill.style.borderRadius = '3px';
      compactPill.style.fontFamily = 'var(--font-mono)';
      compactPill.style.fontSize = '11px';
      compactPill.style.whiteSpace = 'nowrap';
      compactPill.style.overflow = 'hidden';
      compactPill.style.textOverflow = 'ellipsis';
      compactPill.style.cursor = 'pointer';
      compactPill.style.color = 'var(--vscode-symbolIcon-stringForeground, #ce9178)';
      compactPill.style.boxSizing = 'border-box';
      compactPill.title = 'Click to expand: replaces filter horizontally and expands at least 6 rows vertically';
      compactPill.textContent = `📜 ${currentScript}`;

      compactPill.onclick = () => {
        this.isScriptExpanded = true;
        this.render();
      };

      filterWrapper.appendChild(compactPill);
    } else {
      // Expanded state: Textarea replaces filter text input horizontally and expands vertically at least 6 rows
      // Dummy spacer in regular flow to preserve toolbar height
      const spacer = document.createElement('div');
      spacer.style.height = '26px';
      spacer.style.width = '100%';
      filterWrapper.appendChild(spacer);

      // Absolute floating container spanning the full width of the filter input area
      const expandedBox = document.createElement('div');
      expandedBox.id = 'query-script-expanded';
      expandedBox.style.position = 'absolute';
      expandedBox.style.top = '0';
      expandedBox.style.left = '0';
      expandedBox.style.width = '100%';
      expandedBox.style.boxSizing = 'border-box';
      expandedBox.style.backgroundColor = 'var(--vscode-editor-background)';
      expandedBox.style.border = '1px solid var(--vscode-focusBorder, #007fd4)';
      expandedBox.style.borderRadius = '4px';
      expandedBox.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.55)';
      expandedBox.style.zIndex = '1000';
      expandedBox.style.padding = '8px';
      expandedBox.style.display = 'flex';
      expandedBox.style.flexDirection = 'column';
      expandedBox.style.gap = '6px';

      // Header row
      const boxHeader = document.createElement('div');
      boxHeader.style.display = 'flex';
      boxHeader.style.justifyContent = 'space-between';
      boxHeader.style.alignItems = 'center';
      boxHeader.style.fontSize = '11px';
      boxHeader.style.fontWeight = '600';
      boxHeader.style.color = 'var(--vscode-descriptionForeground)';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = '📜 Active Query Script (Ctrl+Enter to Run)';
      boxHeader.appendChild(titleSpan);

      const closeIcon = document.createElement('button');
      closeIcon.className = 'icon-btn';
      closeIcon.textContent = '✕';
      closeIcon.title = 'Collapse (Esc)';
      closeIcon.onclick = () => {
        this.isScriptExpanded = false;
        this.render();
      };
      boxHeader.appendChild(closeIcon);
      expandedBox.appendChild(boxHeader);

      // Multi-line Textarea: at least 6 rows
      const textarea = document.createElement('textarea');
      textarea.id = 'query-script-textarea';
      textarea.rows = 6;
      textarea.style.width = '100%';
      textarea.style.minHeight = '140px';
      textarea.style.boxSizing = 'border-box';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.45';
      textarea.style.padding = '8px';
      textarea.style.backgroundColor = 'var(--vscode-input-background)';
      textarea.style.color = 'var(--vscode-input-foreground)';
      textarea.style.border = '1px solid var(--vscode-input-border, var(--border-color))';
      textarea.style.borderRadius = '3px';
      textarea.style.resize = 'vertical';
      textarea.value = currentScript;

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

      // Collapse when focus leaves the expanded box
      expandedBox.addEventListener('focusout', (e: FocusEvent) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!expandedBox.contains(related)) {
          this.collapseTimeout = setTimeout(() => {
            this.isScriptExpanded = false;
            this.render();
          }, 180);
        }
      });

      expandedBox.addEventListener('focusin', () => {
        if (this.collapseTimeout) {
          clearTimeout(this.collapseTimeout);
          this.collapseTimeout = null;
        }
      });

      // Footer row with hint & action buttons
      const boxFooter = document.createElement('div');
      boxFooter.style.display = 'flex';
      boxFooter.style.justifyContent = 'space-between';
      boxFooter.style.alignItems = 'center';
      boxFooter.style.gap = '8px';

      const hint = document.createElement('span');
      hint.style.fontSize = '11px';
      hint.style.color = 'var(--vscode-descriptionForeground)';
      hint.textContent = 'Executes directly on AxarDB server';
      boxFooter.appendChild(hint);

      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '6px';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        this.isScriptExpanded = false;
        this.render();
      };
      btnGroup.appendChild(cancelBtn);

      const runScriptBtn = document.createElement('button');
      runScriptBtn.textContent = '▶ Run Script';
      runScriptBtn.style.backgroundColor = 'var(--vscode-button-background)';
      runScriptBtn.style.color = 'var(--vscode-button-foreground)';
      runScriptBtn.onclick = () => {
        this.runAdvanced(textarea.value);
        this.isScriptExpanded = false;
        this.render();
      };
      btnGroup.appendChild(runScriptBtn);

      boxFooter.appendChild(btnGroup);

      expandedBox.appendChild(textarea);
      expandedBox.appendChild(boxFooter);
      filterWrapper.appendChild(expandedBox);

      // Auto-focus immediately
      setTimeout(() => {
        textarea.focus();
        textarea.select();
      }, 30);
    }

    this.container.appendChild(filterWrapper);

    // Run Filter Button
    const runBtn = document.createElement('button');
    runBtn.id = 'query-run-btn';
    runBtn.textContent = 'Filter';
    runBtn.onclick = () => {
      const inp = document.getElementById('query-predicate-input') as HTMLInputElement;
      this.runFilter(inp ? inp.value : '');
    };
    this.container.appendChild(runBtn);
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
