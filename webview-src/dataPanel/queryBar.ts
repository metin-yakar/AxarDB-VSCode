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

    // Filter input wrapper
    const filterWrapper = document.createElement('div');
    filterWrapper.style.flex = '1';
    filterWrapper.style.position = 'relative';
    filterWrapper.style.display = 'flex';

    const predicateInput = document.createElement('input');
    predicateInput.id = 'query-predicate-input';
    predicateInput.type = 'text';
    predicateInput.style.width = '100%';
    predicateInput.placeholder = 'e.g. x => x.age > 25 (Enter to filter)';
    predicateInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.runFilter(predicateInput.value);
      }
    };
    filterWrapper.appendChild(predicateInput);
    this.container.appendChild(filterWrapper);

    // Expandable Query Script Area (adjacent to filter)
    const scriptContainer = document.createElement('div');
    scriptContainer.style.position = 'relative';
    scriptContainer.style.display = 'flex';
    scriptContainer.style.alignItems = 'center';

    const currentScript = state.queryScript || `db.${state.collection || 'users'}.findall(x => true).take(${state.pageSize})`;

    if (!this.isScriptExpanded) {
      // Compact Text Pill
      const compactPill = document.createElement('div');
      compactPill.id = 'query-script-pill';
      compactPill.style.height = '24px';
      compactPill.style.maxWidth = '320px';
      compactPill.style.minWidth = '140px';
      compactPill.style.padding = '2px 8px';
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
      compactPill.title = 'Click to expand full editable query script (at least 6 rows)';
      compactPill.textContent = `📜 ${currentScript}`;

      compactPill.onclick = () => {
        this.isScriptExpanded = true;
        this.render();
      };

      scriptContainer.appendChild(compactPill);
    } else {
      // Expanded Floating Textarea: expands horizontally over filter and vertically at least 6 rows
      const expandedBox = document.createElement('div');
      expandedBox.id = 'query-script-expanded';
      expandedBox.style.position = 'absolute';
      expandedBox.style.right = '0';
      expandedBox.style.top = '-6px';
      expandedBox.style.width = '550px';
      expandedBox.style.maxWidth = '85vw';
      expandedBox.style.backgroundColor = 'var(--vscode-editor-background)';
      expandedBox.style.border = '1px solid var(--vscode-focusBorder)';
      expandedBox.style.borderRadius = '4px';
      expandedBox.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.45)';
      expandedBox.style.zIndex = '100';
      expandedBox.style.padding = '8px';
      expandedBox.style.display = 'flex';
      expandedBox.style.flexDirection = 'column';
      expandedBox.style.gap = '6px';

      const boxHeader = document.createElement('div');
      boxHeader.style.display = 'flex';
      boxHeader.style.justifyContent = 'space-between';
      boxHeader.style.alignItems = 'center';
      boxHeader.style.fontSize = '11px';
      boxHeader.style.fontWeight = '600';
      boxHeader.style.color = 'var(--vscode-descriptionForeground)';
      boxHeader.innerHTML = '<span>Active Query Script (Ctrl+Enter to Run)</span>';

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

      const textarea = document.createElement('textarea');
      textarea.id = 'query-script-textarea';
      textarea.rows = 6;
      textarea.style.width = '100%';
      textarea.style.minHeight = '120px';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.4';
      textarea.style.boxSizing = 'border-box';
      textarea.style.padding = '6px';
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

      // Collapse when focus moves out of the expanded box
      expandedBox.addEventListener('focusout', (e: FocusEvent) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!expandedBox.contains(related)) {
          this.collapseTimeout = setTimeout(() => {
            this.isScriptExpanded = false;
            this.render();
          }, 150);
        }
      });

      expandedBox.addEventListener('focusin', () => {
        if (this.collapseTimeout) {
          clearTimeout(this.collapseTimeout);
          this.collapseTimeout = null;
        }
      });

      const boxFooter = document.createElement('div');
      boxFooter.style.display = 'flex';
      boxFooter.style.justifyContent = 'flex-end';
      boxFooter.style.gap = '6px';

      const runScriptBtn = document.createElement('button');
      runScriptBtn.textContent = '▶ Run Script';
      runScriptBtn.onclick = () => {
        this.runAdvanced(textarea.value);
        this.isScriptExpanded = false;
        this.render();
      };

      boxFooter.appendChild(runScriptBtn);

      expandedBox.appendChild(textarea);
      expandedBox.appendChild(boxFooter);
      scriptContainer.appendChild(expandedBox);

      // Auto-focus immediately
      setTimeout(() => {
        textarea.focus();
        textarea.select();
      }, 20);
    }

    this.container.appendChild(scriptContainer);

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
