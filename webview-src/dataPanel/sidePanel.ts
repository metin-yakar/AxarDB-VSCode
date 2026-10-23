import { Doc } from '../../src/contracts/types.js';
import { highlightJson } from '../shared/jsonHighlight.js';
import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';
import { createComplexFieldEditor } from './recordTreeEditor.js';

export class SidePanel {
  private container: HTMLElement;
  private activeTab: 'record' | 'json' = 'record';
  private isJsonEditing = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(selectedDoc: Doc | null, selectedRowIndex: number | null, readOnly: boolean): void {
    if (!selectedDoc || selectedRowIndex === null) {
      this.container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--vscode-descriptionForeground); font-size: 12px; padding: 20px; text-align: center;">
          Select a row to inspect its record details and JSON.
        </div>
      `;
      return;
    }

    this.container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.height = '100%';
    wrapper.style.overflow = 'hidden';

    // Header with _id & actions
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.padding = '6px 10px';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    const title = document.createElement('span');
    title.style.fontFamily = 'var(--font-mono)';
    title.style.fontSize = '11px';
    title.style.fontWeight = '600';
    title.textContent = `_id: ${selectedDoc._id || `#${selectedRowIndex}`}`;
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.style.display = 'flex';
    headerActions.style.gap = '4px';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'icon-btn';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy Document JSON';
    copyBtn.onclick = () => {
      postMessageToHost<PanelToHost>({
        type: 'copy',
        text: JSON.stringify(selectedDoc, null, 2),
      });
    };
    headerActions.appendChild(copyBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close Panel';
    closeBtn.onclick = () => {
      store.update({ sidePanelVisible: false });
    };
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    wrapper.appendChild(header);

    // Tab Navigation Bar (Record vs JSON)
    const tabBar = document.createElement('div');
    tabBar.style.display = 'flex';
    tabBar.style.borderBottom = '1px solid var(--border-color)';
    tabBar.style.backgroundColor = 'var(--vscode-editorGroupHeader-tabsBackground, rgba(0,0,0,0.1))';

    const recordTabBtn = document.createElement('button');
    recordTabBtn.textContent = '📝 Record View';
    recordTabBtn.style.flex = '1';
    recordTabBtn.style.padding = '6px 12px';
    recordTabBtn.style.borderRadius = '0';
    recordTabBtn.style.fontSize = '11px';
    recordTabBtn.style.border = 'none';
    recordTabBtn.style.borderBottom = this.activeTab === 'record' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent';
    recordTabBtn.style.backgroundColor = this.activeTab === 'record' ? 'var(--vscode-editor-background)' : 'transparent';
    recordTabBtn.onclick = () => {
      this.activeTab = 'record';
      this.render(selectedDoc, selectedRowIndex, readOnly);
    };
    tabBar.appendChild(recordTabBtn);

    const jsonTabBtn = document.createElement('button');
    jsonTabBtn.textContent = '{ } JSON View';
    jsonTabBtn.style.flex = '1';
    jsonTabBtn.style.padding = '6px 12px';
    jsonTabBtn.style.borderRadius = '0';
    jsonTabBtn.style.fontSize = '11px';
    jsonTabBtn.style.border = 'none';
    jsonTabBtn.style.borderBottom = this.activeTab === 'json' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent';
    jsonTabBtn.style.backgroundColor = this.activeTab === 'json' ? 'var(--vscode-editor-background)' : 'transparent';
    jsonTabBtn.onclick = () => {
      this.activeTab = 'json';
      this.render(selectedDoc, selectedRowIndex, readOnly);
    };
    tabBar.appendChild(jsonTabBtn);

    wrapper.appendChild(tabBar);

    // Tab Content Body (Scrollable independently)
    const contentBody = document.createElement('div');
    contentBody.style.flex = '1';
    contentBody.style.overflowY = 'auto';
    contentBody.style.padding = '10px';

    if (this.activeTab === 'record') {
      this.renderRecordForm(contentBody, selectedDoc, selectedRowIndex, readOnly);
    } else {
      this.renderJsonTab(contentBody, selectedDoc, selectedRowIndex, readOnly);
    }

    wrapper.appendChild(contentBody);
    this.container.appendChild(wrapper);
  }

  private renderRecordForm(container: HTMLElement, doc: Doc, rowIndex: number, readOnly: boolean): void {
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';

    const inputMap = new Map<string, () => unknown>();

    for (const [key, value] of Object.entries(doc)) {
      const fieldRow = document.createElement('div');
      fieldRow.style.display = 'flex';
      fieldRow.style.flexDirection = 'column';
      fieldRow.style.gap = '4px';

      const labelBar = document.createElement('div');
      labelBar.style.display = 'flex';
      labelBar.style.justifyContent = 'space-between';
      labelBar.style.alignItems = 'center';

      const label = document.createElement('label');
      label.style.fontWeight = '600';
      label.style.fontSize = '11px';
      label.style.color = key === '_id' ? 'var(--vscode-symbolIcon-keyForeground, #9cdcfe)' : 'var(--vscode-foreground)';
      label.textContent = key;
      labelBar.appendChild(label);

      const typeTag = document.createElement('span');
      typeTag.style.fontSize = '10px';
      typeTag.style.color = 'var(--vscode-descriptionForeground)';
      typeTag.textContent = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      labelBar.appendChild(typeTag);

      fieldRow.appendChild(labelBar);

      const applyControlStyle = (el: HTMLElement) => {
        el.style.backgroundColor = 'var(--vscode-input-background, #1e1e1e)';
        el.style.color = 'var(--vscode-input-foreground, #cccccc)';
        el.style.border = '1px solid var(--vscode-input-border, rgba(255, 255, 255, 0.15))';
        el.style.borderRadius = '3px';
        el.style.padding = '5px 8px';
        el.style.fontSize = '12px';
        el.style.boxSizing = 'border-box';
        el.style.width = '100%';
        el.style.outline = 'none';
      };

      // Create input based on type
      if (key === '_id' || readOnly) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        input.disabled = true;
        input.style.fontFamily = 'var(--font-mono)';
        input.style.opacity = '0.75';
        input.style.cursor = 'not-allowed';
        applyControlStyle(input);
        fieldRow.appendChild(input);
        inputMap.set(key, () => value);
      } else if (typeof value === 'boolean') {
        const select = document.createElement('select');
        applyControlStyle(select);
        const optTrue = document.createElement('option');
        optTrue.value = 'true';
        optTrue.textContent = 'true';
        if (value === true) optTrue.selected = true;

        const optFalse = document.createElement('option');
        optFalse.value = 'false';
        optFalse.textContent = 'false';
        if (value === false) optFalse.selected = true;

        select.appendChild(optTrue);
        select.appendChild(optFalse);
        fieldRow.appendChild(select);
        inputMap.set(key, () => select.value === 'true');
      } else if (typeof value === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(value);
        applyControlStyle(input);
        fieldRow.appendChild(input);
        inputMap.set(key, () => (input.value === '' ? null : Number(input.value)));
      } else if (typeof value === 'object' && value !== null) {
        const treeEditor = createComplexFieldEditor(value, readOnly);
        fieldRow.appendChild(treeEditor.element);
        inputMap.set(key, treeEditor.getValue);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value === null || value === undefined ? '' : String(value);
        applyControlStyle(input);
        fieldRow.appendChild(input);
        inputMap.set(key, () => (value === null && input.value === '' ? null : input.value));
      }

      form.appendChild(fieldRow);
    }

    if (!readOnly) {
      const btnBar = document.createElement('div');
      btnBar.style.display = 'flex';
      btnBar.style.justifyContent = 'flex-end';
      btnBar.style.gap = '8px';
      btnBar.style.marginTop = '12px';
      btnBar.style.paddingTop = '10px';
      btnBar.style.borderTop = '1px solid var(--border-color)';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = '💾 Save Record';
      saveBtn.onclick = () => {
        const updatedDoc: Doc = {};
        for (const [k, getter] of inputMap.entries()) {
          updatedDoc[k] = getter();
        }
        postMessageToHost<PanelToHost>({
          type: 'saveDoc',
          rowIndex,
          doc: updatedDoc,
        });
      };

      btnBar.appendChild(saveBtn);
      form.appendChild(btnBar);
    }

    container.appendChild(form);
  }

  private renderJsonTab(container: HTMLElement, doc: Doc, rowIndex: number, readOnly: boolean): void {
    if (this.isJsonEditing && !readOnly) {
      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.height = 'calc(100% - 48px)';
      textarea.style.minHeight = '250px';
      textarea.style.fontFamily = 'var(--font-mono)';
      textarea.style.fontSize = '12px';
      textarea.style.lineHeight = '1.4';
      textarea.style.boxSizing = 'border-box';
      textarea.value = JSON.stringify(doc, null, 2);

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
        this.isJsonEditing = false;
        this.render(doc, rowIndex, readOnly);
      };

      const saveBtn = document.createElement('button');
      saveBtn.textContent = '💾 Save JSON';
      saveBtn.onclick = () => {
        errDiv.textContent = '';
        try {
          const parsed = JSON.parse(textarea.value);
          postMessageToHost<PanelToHost>({
            type: 'saveDoc',
            rowIndex,
            doc: parsed,
          });
          this.isJsonEditing = false;
        } catch (e: unknown) {
          errDiv.textContent = (e as Error).message;
        }
      };

      saveBar.appendChild(cancelBtn);
      saveBar.appendChild(saveBtn);

      container.appendChild(textarea);
      container.appendChild(errDiv);
      container.appendChild(saveBar);
    } else {
      if (!readOnly) {
        const topBar = document.createElement('div');
        topBar.style.display = 'flex';
        topBar.style.justifyContent = 'flex-end';
        topBar.style.marginBottom = '8px';

        const editBtn = document.createElement('button');
        editBtn.className = 'secondary';
        editBtn.style.fontSize = '11px';
        editBtn.textContent = '✏️ Edit JSON';
        editBtn.onclick = () => {
          this.isJsonEditing = true;
          this.render(doc, rowIndex, readOnly);
        };
        topBar.appendChild(editBtn);
        container.appendChild(topBar);
      }

      const jsonPreview = document.createElement('div');
      jsonPreview.innerHTML = highlightJson(doc);
      container.appendChild(jsonPreview);
    }
  }
}
