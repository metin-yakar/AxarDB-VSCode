import { Doc, ExportFormat, HistoryEntry } from '../../src/contracts/types.js';
import { openModal } from '../shared/modal.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';
import { store } from './store.js';

export function openInsertDialog(template?: Doc): void {
  const container = document.createElement('div');
  container.style.width = '480px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  const desc = document.createElement('div');
  desc.style.fontSize = '12px';
  desc.style.color = 'var(--vscode-descriptionForeground)';
  desc.textContent = 'Enter JSON payload to insert into collection. _id will be generated automatically if omitted.';
  container.appendChild(desc);

  const textarea = document.createElement('textarea');
  textarea.id = 'insert-dialog-textarea';
  textarea.style.width = '100%';
  textarea.style.height = '180px';
  textarea.style.fontFamily = 'var(--font-mono)';
  textarea.style.fontSize = '12px';
  textarea.style.boxSizing = 'border-box';

  let initialVal: Record<string, unknown> = {
    name: 'New Item',
    active: true,
  };

  if (template) {
    initialVal = {};
    for (const [k, v] of Object.entries(template)) {
      if (k !== '_id') {
        initialVal[k] = typeof v === 'string' ? '' : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : null;
      }
    }
  }

  textarea.value = JSON.stringify(initialVal, null, 2);
  container.appendChild(textarea);

  const errDiv = document.createElement('div');
  errDiv.style.color = 'var(--vscode-errorForeground, #f14c4c)';
  errDiv.style.fontSize = '11px';
  container.appendChild(errDiv);

  openModal({
    title: 'Insert Document',
    body: container,
    confirmText: 'Insert',
    onConfirm: () => {
      errDiv.textContent = '';
      try {
        const parsed = JSON.parse(textarea.value);
        postMessageToHost<PanelToHost>({
          type: 'saveDoc',
          rowIndex: null, // null => insert
          doc: parsed,
        });
        return true;
      } catch (e: unknown) {
        errDiv.textContent = (e as Error).message;
        return false;
      }
    },
  });
}

export function openExportDialog(): void {
  const state = store.getState();
  const container = document.createElement('div');
  container.style.width = '380px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '12px';
  container.style.fontSize = '12px';

  // Scope
  const scopeGroup = document.createElement('div');
  scopeGroup.innerHTML = '<strong>Export Scope:</strong>';
  const scopeSelect = document.createElement('select');
  scopeSelect.style.width = '100%';
  scopeSelect.style.marginTop = '4px';

  const optPage = document.createElement('option');
  optPage.value = 'page';
  optPage.textContent = `Current Page (${state.docs.length} records)`;
  scopeSelect.appendChild(optPage);

  if (state.selectedRowIndex !== null) {
    const optSel = document.createElement('option');
    optSel.value = 'selection';
    optSel.textContent = 'Selected Record';
    scopeSelect.appendChild(optSel);
  }

  const optCol = document.createElement('option');
  optCol.value = 'collection';
  optCol.textContent = `Entire Collection (${state.total} records)`;
  scopeSelect.appendChild(optCol);

  scopeGroup.appendChild(scopeSelect);
  container.appendChild(scopeGroup);

  // Format
  const fmtGroup = document.createElement('div');
  fmtGroup.innerHTML = '<strong>Format:</strong>';
  const fmtSelect = document.createElement('select');
  fmtSelect.style.width = '100%';
  fmtSelect.style.marginTop = '4px';

  const fJson = document.createElement('option');
  fJson.value = 'json';
  fJson.textContent = 'JSON Array (.json)';
  fmtSelect.appendChild(fJson);

  const fJsonl = document.createElement('option');
  fJsonl.value = 'jsonl';
  fJsonl.textContent = 'JSON Lines (.jsonl)';
  fmtSelect.appendChild(fJsonl);

  const fCsv = document.createElement('option');
  fCsv.value = 'csv';
  fCsv.textContent = 'Comma Separated Values (.csv)';
  fmtSelect.appendChild(fCsv);

  fmtGroup.appendChild(fmtSelect);
  container.appendChild(fmtGroup);

  openModal({
    title: 'Export Data',
    body: container,
    confirmText: 'Export...',
    onConfirm: () => {
      const scope = scopeSelect.value as 'page' | 'selection' | 'collection';
      const format = fmtSelect.value as ExportFormat;
      const rowIndexes = scope === 'selection' && state.selectedRowIndex !== null ? [state.selectedRowIndex] : undefined;

      postMessageToHost<PanelToHost>({
        type: 'export',
        scope,
        format,
        rowIndexes,
      });
      return true;
    },
  });
}

export function openHistoryDialog(entries: HistoryEntry[]): void {
  const container = document.createElement('div');
  container.style.width = '550px';
  container.style.maxHeight = '400px';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search past queries...';
  searchInput.style.width = '100%';
  container.appendChild(searchInput);

  const listDiv = document.createElement('div');
  listDiv.style.flex = '1';
  listDiv.style.overflowY = 'auto';
  listDiv.style.maxHeight = '300px';
  listDiv.style.display = 'flex';
  listDiv.style.flexDirection = 'column';
  listDiv.style.gap = '4px';

  const renderItems = (filter = '') => {
    listDiv.innerHTML = '';
    const q = filter.toLowerCase();
    const filtered = entries.filter((e) => e.script.toLowerCase().includes(q));

    if (filtered.length === 0) {
      listDiv.innerHTML = '<div style="color:var(--vscode-descriptionForeground); font-size:12px; padding:10px;">No matching queries.</div>';
      return;
    }

    for (const item of filtered) {
      const row = document.createElement('div');
      row.style.padding = '6px 8px';
      row.style.borderRadius = '3px';
      row.style.border = '1px solid var(--border-color)';
      row.style.cursor = 'pointer';
      row.style.fontSize = '12px';
      row.style.fontFamily = 'var(--font-mono)';

      row.onmouseenter = () => (row.style.backgroundColor = 'var(--vscode-list-hoverBackground)');
      row.onmouseleave = () => (row.style.backgroundColor = 'transparent');

      row.onclick = () => {
        postMessageToHost<PanelToHost>({
          type: 'runQuery',
          script: item.script,
        });
        modalRef.close();
      };

      const top = document.createElement('div');
      top.style.display = 'flex';
      top.style.justifyContent = 'space-between';
      top.style.color = 'var(--vscode-descriptionForeground)';
      top.style.fontSize = '10px';
      top.innerHTML = `<span>${item.executedAt.replace('T', ' ').substring(0, 19)}</span><span>${item.elapsedMs}ms</span>`;
      row.appendChild(top);

      const code = document.createElement('div');
      code.style.marginTop = '2px';
      code.textContent = item.script;
      row.appendChild(code);

      listDiv.appendChild(row);
    }
  };

  renderItems();
  searchInput.oninput = () => renderItems(searchInput.value);
  container.appendChild(listDiv);

  const modalRef = openModal({
    title: 'Query History (Click to run)',
    body: container,
    cancelText: 'Close',
  });
}
