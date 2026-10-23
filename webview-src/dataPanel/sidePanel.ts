import { Doc } from '../../src/contracts/types.js';
import { highlightJson } from '../shared/jsonHighlight.js';
import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class SidePanel {
  private container: HTMLElement;
  private isEditing = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(selectedDoc: Doc | null, selectedRowIndex: number | null, readOnly: boolean): void {
    if (!selectedDoc || selectedRowIndex === null) {
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); font-size: 12px; padding: 20px; text-align: center;">
          Select a row to inspect its JSON document.
        </div>
      `;
      return;
    }

    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.height = '100%';

    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '8px 12px';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    const title = document.createElement('span');
    title.style.fontFamily = 'var(--font-mono)';
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.textContent = `_id: ${selectedDoc._id || `#${selectedRowIndex}`}`;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'icon-btn';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy JSON';
    copyBtn.onclick = () => {
      postMessageToHost<PanelToHost>({
        type: 'copy',
        text: JSON.stringify(selectedDoc, null, 2),
      });
    };
    actions.appendChild(copyBtn);

    if (!readOnly) {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.textContent = this.isEditing ? '👁️' : '✏️';
      editBtn.title = this.isEditing ? 'View Mode' : 'Edit Document';
      editBtn.onclick = () => {
        this.isEditing = !this.isEditing;
        this.render(selectedDoc, selectedRowIndex, readOnly);
      };
      actions.appendChild(editBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close Side Panel';
    closeBtn.onclick = () => {
      store.update({ sidePanelVisible: false });
    };
    actions.appendChild(closeBtn);

    header.appendChild(actions);
    wrapper.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.style.flex = '1';
    body.style.overflow = 'auto';
    body.style.padding = '10px';

    if (this.isEditing && !readOnly) {
      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.height = 'calc(100% - 40px)';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.4';
      textarea.style.boxSizing = 'border-box';
      textarea.value = JSON.stringify(selectedDoc, null, 2);

      const errDiv = document.createElement('div');
      errDiv.style.color = 'var(--vscode-errorForeground, #f14c4c)';
      errDiv.style.fontSize = '11px';
      errDiv.style.marginTop = '4px';

      const saveBar = document.createElement('div');
      saveBar.style.display = 'flex';
      saveBar.style.justifyContent = 'flex-end';
      saveBar.style.gap = '8px';
      saveBar.style.marginTop = '8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => {
        this.isEditing = false;
        this.render(selectedDoc, selectedRowIndex, readOnly);
      };

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save Document';
      saveBtn.onclick = () => {
        errDiv.textContent = '';
        try {
          const parsed = JSON.parse(textarea.value);
          postMessageToHost<PanelToHost>({
            type: 'saveDoc',
            rowIndex: selectedRowIndex,
            doc: parsed,
          });
          this.isEditing = false;
        } catch (e: unknown) {
          errDiv.textContent = (e as Error).message;
        }
      };

      saveBar.appendChild(cancelBtn);
      saveBar.appendChild(saveBtn);

      body.appendChild(textarea);
      body.appendChild(errDiv);
      body.appendChild(saveBar);
    } else {
      body.innerHTML = highlightJson(selectedDoc);
    }

    wrapper.appendChild(body);
    this.container.appendChild(wrapper);
  }
}
