import { Doc } from '../../src/contracts/types.js';
import { highlightJson } from '../shared/jsonHighlight.js';
import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class JsonView {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(docs: Doc[], readOnly: boolean, selectedRowIndex: number | null): void {
    if (docs.length === 0) {
      this.container.innerHTML = '<div class="grid-placeholder">No documents found.</div>';
      return;
    }

    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'json-doc-list';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '8px';
    wrapper.style.padding = '8px';
    wrapper.style.overflowY = 'auto';
    wrapper.style.height = '100%';

    docs.forEach((doc, rowIndex) => {
      const card = document.createElement('div');
      card.className = `json-card ${selectedRowIndex === rowIndex ? 'selected' : ''}`;
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '3px';
      card.style.backgroundColor = selectedRowIndex === rowIndex ? 'var(--vscode-list-activeSelectionBackground, #04395e)' : 'var(--vscode-editor-background)';
      card.style.color = selectedRowIndex === rowIndex ? 'var(--vscode-list-activeSelectionForeground, #ffffff)' : 'var(--vscode-foreground)';
      card.style.cursor = 'pointer';

      // Attach context menu attribute
      card.setAttribute(
        'data-vscode-context',
        JSON.stringify({
          webviewSection: 'row',
          rowIndex,
          preventDefaultContextMenuItems: true,
        })
      );

      card.onclick = (e) => {
        e.stopPropagation();
        store.selectRow(rowIndex);
        postMessageToHost<PanelToHost>({ type: 'selectRow', rowIndex });
      };

      // Header
      const header = document.createElement('div');
      header.className = 'json-card-header';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.padding = '6px 10px';
      header.style.borderBottom = '1px solid var(--border-color)';
      header.style.fontFamily = 'var(--font-mono)';
      header.style.fontSize = '11px';

      const title = document.createElement('span');
      title.textContent = `_id: ${doc._id || `#${rowIndex}`}`;
      header.appendChild(title);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '4px';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'icon-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Copy JSON';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        postMessageToHost<PanelToHost>({ type: 'copy', text: JSON.stringify(doc, null, 2) });
      };
      actions.appendChild(copyBtn);

      header.appendChild(actions);
      card.appendChild(header);

      // Body
      const body = document.createElement('div');
      body.className = 'json-card-body';
      body.style.padding = '8px 10px';
      body.innerHTML = highlightJson(doc);
      card.appendChild(body);

      wrapper.appendChild(card);
    });

    this.container.appendChild(wrapper);
  }
}
