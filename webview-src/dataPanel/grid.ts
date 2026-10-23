import { store } from './store.js';
import { Doc } from '../../src/contracts/types.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class DataGrid {
  private container: HTMLElement;
  private pendingEdits = new Set<string>(); // "rowIndex:field"
  private sortField: string | null = null;
  private sortDir: 'asc' | 'desc' = 'asc';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(docs: Doc[], readOnly: boolean, selectedRowIndex: number | null): void {
    if (docs.length === 0) {
      this.container.innerHTML = '<div class="grid-placeholder">No documents found.</div>';
      return;
    }

    // Determine all unique column headers across all docs
    const columnSet = new Set<string>();
    for (const doc of docs) {
      for (const k of Object.keys(doc)) {
        columnSet.add(k);
      }
    }

    const columns = Array.from(columnSet);
    if (columnSet.has('_id')) {
      columns.splice(columns.indexOf('_id'), 1);
      columns.unshift('_id');
    }

    const table = document.createElement('table');
    table.className = 'axardb-table';

    // Thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    for (const col of columns) {
      const th = document.createElement('th');
      th.className = 'sortable';
      if (col === '_id') th.classList.add('_id-col');

      const titleSpan = document.createElement('span');
      titleSpan.textContent = col;
      th.appendChild(titleSpan);

      // Sort indicator
      if (this.sortField === col) {
        const arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        arrow.textContent = this.sortDir === 'asc' ? '▲' : '▼';
        th.appendChild(arrow);
      }

      th.title = `Sort by ${col} (${this.sortField === col && this.sortDir === 'asc' ? 'descending' : 'ascending'})`;
      th.onclick = (e) => {
        e.stopPropagation();
        this.toggleSort(col);
      };

      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Tbody
    const tbody = document.createElement('tbody');

    docs.forEach((doc, rowIndex) => {
      const tr = document.createElement('tr');
      if (selectedRowIndex === rowIndex) {
        tr.className = 'selected';
      }

      // Attach VS Code context menu info
      tr.setAttribute(
        'data-vscode-context',
        JSON.stringify({
          webviewSection: 'row',
          rowIndex,
          preventDefaultContextMenuItems: true,
        })
      );

      tr.onclick = (e) => {
        e.stopPropagation();
        store.selectRow(rowIndex);
        postMessageToHost<PanelToHost>({ type: 'selectRow', rowIndex });
      };

      for (const col of columns) {
        const td = document.createElement('td');
        if (col === '_id') td.className = '_id-col';

        const val = doc[col];
        const editKey = `${rowIndex}:${col}`;
        if (this.pendingEdits.has(editKey)) {
          td.classList.add('cell-pending');
        }

        const renderedValue = this.createCellContent(val, col);
        if (typeof renderedValue === 'string') {
          td.textContent = renderedValue;
        } else {
          td.appendChild(renderedValue);
        }

        const rawStr = val === null ? 'null' : typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        td.title = rawStr;

        // Double click to edit cell (if not readOnly and not _id)
        if (!readOnly && col !== '_id') {
          td.ondblclick = (e) => {
            e.stopPropagation();
            this.startCellEdit(td, rowIndex, col, val);
          };
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    this.container.innerHTML = '';
    this.container.appendChild(table);
  }

  private toggleSort(col: string): void {
    if (this.sortField === col) {
      if (this.sortDir === 'asc') {
        this.sortDir = 'desc';
      } else {
        this.sortField = null;
        this.sortDir = 'asc';
      }
    } else {
      this.sortField = col;
      this.sortDir = 'asc';
    }

    const state = store.getState();
    postMessageToHost<PanelToHost>({
      type: 'loadPage',
      req: {
        skip: 0,
        take: state.pageSize,
        sort: this.sortField ? { field: this.sortField, dir: this.sortDir } : undefined,
      },
    });
  }

  private createCellContent(val: unknown, col: string): HTMLElement | string {
    if (col === '_id') {
      const span = document.createElement('span');
      span.className = 'cell-id';
      span.textContent = String(val ?? '');
      return span;
    }

    if (typeof val === 'boolean') {
      const badge = document.createElement('span');
      badge.className = `cell-badge badge-bool-${val}`;
      badge.textContent = String(val);
      return badge;
    }

    if (typeof val === 'number') {
      const span = document.createElement('span');
      span.className = 'cell-num';
      span.textContent = String(val);
      return span;
    }

    if (val === null) {
      const span = document.createElement('span');
      span.className = 'cell-null';
      span.textContent = 'null';
      return span;
    }

    if (Array.isArray(val)) {
      const badge = document.createElement('span');
      badge.className = 'cell-badge badge-array';
      badge.textContent = `[${val.length} items]`;
      return badge;
    }

    if (typeof val === 'object' && val !== null) {
      const badge = document.createElement('span');
      badge.className = 'cell-badge badge-obj';
      badge.textContent = `{${Object.keys(val).length} keys}`;
      return badge;
    }

    return String(val ?? '');
  }

  private startCellEdit(td: HTMLTableCellElement, rowIndex: number, field: string, oldValue: unknown): void {
    if (td.classList.contains('cell-editing')) return;

    td.classList.add('cell-editing');
    const originalContent = td.innerHTML;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = typeof oldValue === 'object' && oldValue !== null ? JSON.stringify(oldValue) : oldValue === null ? '' : String(oldValue ?? '');

    td.innerHTML = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const finishEdit = (commit: boolean) => {
      if (!td.classList.contains('cell-editing')) return;
      td.classList.remove('cell-editing');

      if (!commit) {
        td.innerHTML = originalContent;
        return;
      }

      const newValStr = input.value.trim();
      let parsedVal: unknown = newValStr;

      // Infer types
      if (newValStr === 'null' || newValStr === '') {
        parsedVal = null;
      } else if (newValStr === 'true') {
        parsedVal = true;
      } else if (newValStr === 'false') {
        parsedVal = false;
      } else if (!isNaN(Number(newValStr)) && newValStr !== '') {
        parsedVal = Number(newValStr);
      } else if ((newValStr.startsWith('{') && newValStr.endsWith('}')) || (newValStr.startsWith('[') && newValStr.endsWith(']'))) {
        try {
          parsedVal = JSON.parse(newValStr);
        } catch {
          // Keep string if not valid JSON
        }
      }

      if (parsedVal !== oldValue) {
        const editKey = `${rowIndex}:${field}`;
        this.pendingEdits.add(editKey);
        td.classList.add('cell-pending');
        td.innerHTML = '';
        const updatedContent = this.createCellContent(parsedVal, field);
        if (typeof updatedContent === 'string') {
          td.textContent = updatedContent;
        } else {
          td.appendChild(updatedContent);
        }

        postMessageToHost<PanelToHost>({
          type: 'cellEdit',
          rowIndex,
          field,
          value: parsedVal,
          oldValue,
        });
      } else {
        td.innerHTML = originalContent;
      }
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        finishEdit(true);
      } else if (e.key === 'Escape') {
        finishEdit(false);
      }
    };

    input.onblur = () => {
      finishEdit(true);
    };
  }

  public resolvePendingEdit(rowIndex: number, field: string): void {
    this.pendingEdits.delete(`${rowIndex}:${field}`);
  }
}
