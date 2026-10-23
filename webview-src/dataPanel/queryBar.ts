import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class QueryBar {
  private container: HTMLElement;
  private isAdvanced = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    const state = store.getState();
    this.container.innerHTML = '';
    this.container.className = 'query-bar';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '8px';
    this.container.style.padding = '6px 10px';
    this.container.style.borderBottom = '1px solid var(--border-color)';
    this.container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    const label = document.createElement('span');
    label.style.fontSize = '11px';
    label.style.fontWeight = '600';
    label.style.color = 'var(--vscode-descriptionForeground)';
    label.textContent = this.isAdvanced ? 'Script:' : 'Filter:';
    this.container.appendChild(label);

    const inputWrapper = document.createElement('div');
    inputWrapper.style.flex = '1';
    inputWrapper.style.display = 'flex';

    if (this.isAdvanced) {
      const textarea = document.createElement('textarea');
      textarea.id = 'query-advanced-input';
      textarea.style.width = '100%';
      textarea.style.height = '60px';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.placeholder = `db.${state.collection}.findall(x => true).take(50)`;
      textarea.value = state.queryScript;
      textarea.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.runAdvanced(textarea.value);
        }
      };
      inputWrapper.appendChild(textarea);
    } else {
      const input = document.createElement('input');
      input.id = 'query-predicate-input';
      input.type = 'text';
      input.style.width = '100%';
      input.placeholder = 'e.g. x => x.age > 25 (Ctrl+Enter to run)';
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.runFilter(input.value);
        }
      };
      inputWrapper.appendChild(input);
    }

    this.container.appendChild(inputWrapper);

    const runBtn = document.createElement('button');
    runBtn.id = 'query-run-btn';
    runBtn.textContent = 'Run';
    runBtn.onclick = () => {
      if (this.isAdvanced) {
        const ta = document.getElementById('query-advanced-input') as HTMLTextAreaElement;
        this.runAdvanced(ta ? ta.value : '');
      } else {
        const inp = document.getElementById('query-predicate-input') as HTMLInputElement;
        this.runFilter(inp ? inp.value : '');
      }
    };
    this.container.appendChild(runBtn);

    const toggleAdvBtn = document.createElement('button');
    toggleAdvBtn.className = 'icon-btn';
    toggleAdvBtn.textContent = this.isAdvanced ? 'Simple' : 'Advanced';
    toggleAdvBtn.style.fontSize = '11px';
    toggleAdvBtn.onclick = () => {
      this.isAdvanced = !this.isAdvanced;
      this.render();
    };
    this.container.appendChild(toggleAdvBtn);
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
