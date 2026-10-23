import { store } from './store.js';
import { Toolbar } from './toolbar.js';
import { QueryBar } from './queryBar.js';
import { Pager } from './pager.js';
import { DataGrid } from './grid.js';
import { JsonView } from './jsonView.js';
import { SidePanel } from './sidePanel.js';
import { initSplitter } from '../shared/splitter.js';
import { showToast } from '../shared/toast.js';
import { openInsertDialog, openExportDialog, openHistoryDialog } from './dialogs.js';
import { onHostMessage, postMessageToHost } from '../shared/vscodeApi.js';
import { HostToPanel, PanelToHost } from '../../src/contracts/messages.js';
import { Doc } from '../../src/contracts/types.js';

// DOM Elements
const toolbarContainer = document.getElementById('toolbar-container') as HTMLElement;
const querybarContainer = document.getElementById('querybar-container') as HTMLElement;
const mainContent = document.getElementById('main-content') as HTMLElement;
const gridContainer = document.getElementById('grid-container') as HTMLElement;
const splitterEl = document.getElementById('splitter') as HTMLElement;
const sidepanelContainer = document.getElementById('sidepanel-container') as HTMLElement;
const pagerContainer = document.getElementById('pager-container') as HTMLElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;
const errorBanner = document.getElementById('error-banner') as HTMLElement;

// Component instances
const toolbar = new Toolbar(toolbarContainer);
const queryBar = new QueryBar(querybarContainer);
const pager = new Pager(pagerContainer);
const dataGrid = new DataGrid(gridContainer);
const jsonView = new JsonView(gridContainer);
const sidePanel = new SidePanel(sidepanelContainer);

// Initialize splitter
initSplitter(splitterEl, {
  container: mainContent,
  leftPane: gridContainer,
  rightPane: sidepanelContainer,
  initialWidth: 320,
  minWidth: 200,
  maxWidth: 800,
});

// Custom event listeners
window.addEventListener('axardb:openInsert', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  openInsertDialog(detail);
});

window.addEventListener('axardb:openExport', () => {
  openExportDialog();
});

// Subscribe to store updates
store.subscribe((state) => {
  toolbar.render();
  queryBar.render();
  pager.render();

  // Mode render
  if (state.mode === 'grid') {
    dataGrid.render(state.docs, state.readOnly, state.selectedRowIndex);
  } else {
    jsonView.render(state.docs, state.readOnly, state.selectedRowIndex);
  }

  // Side panel visibility & render
  if (state.sidePanelVisible) {
    sidepanelContainer.style.display = 'flex';
    splitterEl.style.display = 'block';
    sidePanel.render(state.selectedDoc, state.selectedRowIndex, state.readOnly);
  } else {
    sidepanelContainer.style.display = 'none';
    splitterEl.style.display = 'none';
  }

  // Error banner
  if (state.error) {
    errorBanner.style.display = 'block';
    errorBanner.textContent = state.error;
  } else {
    errorBanner.style.display = 'none';
  }

  // Loading indicator
  loadingOverlay.style.display = state.loading ? 'flex' : 'none';
});

// Host message routing
onHostMessage<HostToPanel>((msg) => {
  switch (msg.type) {
    case 'init':
      store.update({
        serverName: msg.serverName,
        collection: msg.collection,
        kind: msg.kind,
        mode: msg.mode,
        pageSize: msg.pageSize,
        readOnly: msg.readOnly,
        queryScript: msg.initialScript || '',
        knownCollections: msg.collections || [],
        loading: false,
        error: null,
      });
      break;

    case 'page':
      store.update({
        docs: msg.result.docs,
        total: msg.result.total,
        skip: msg.result.skip,
        elapsedMs: msg.result.elapsedMs,
        queryScript: msg.result.script || store.getState().queryScript,
        loading: false,
        error: null,
      });
      break;

    case 'queryResult': {
      let docs: Doc[] = [];
      if (msg.result.docs && Array.isArray(msg.result.docs)) {
        docs = msg.result.docs;
      } else if (Array.isArray(msg.result.data)) {
        docs = msg.result.data.map((item, idx) =>
          typeof item === 'object' && item !== null ? (item as Doc) : { _id: String(idx), value: item }
        );
      } else if (msg.result.data !== null && msg.result.data !== undefined) {
        if (typeof msg.result.data === 'object') {
          docs = [msg.result.data as Doc];
        } else {
          docs = [{ _id: 'result', value: msg.result.data }];
        }
      }

      if (msg.result.ok) {
        store.update({
          docs,
          total: docs.length,
          skip: 0,
          elapsedMs: msg.result.elapsedMs,
          queryScript: msg.result.script || store.getState().queryScript,
          loading: false,
          error: null,
        });
        showToast(`Query completed: ${docs.length} row(s) (${msg.result.elapsedMs}ms)`, 'info');
      } else {
        const errorMsg =
          msg.result.error?.detail ||
          msg.result.error?.message ||
          'Query execution failed';
        store.update({
          loading: false,
          error: errorMsg,
        });
        showToast(errorMsg, 'error');
      }
      break;
    }

    case 'history':
      openHistoryDialog(msg.entries);
      break;

    case 'docSaved':
      showToast('Document saved successfully', 'success');
      // Reload current page
      {
        const st = store.getState();
        postMessageToHost<PanelToHost>({
          type: 'loadPage',
          req: { skip: st.skip, take: st.pageSize },
        });
      }
      break;

    case 'editRejected':
      dataGrid.resolvePendingEdit(msg.rowIndex, msg.field);
      showToast(`Edit rejected: ${msg.error}`, 'error');
      break;

    case 'loading':
      store.update({ loading: msg.on });
      break;

    case 'error':
      store.update({ loading: false, error: msg.message });
      showToast(msg.message, 'error');
      break;

    case 'openInsertDialog':
      openInsertDialog(msg.template);
      break;

    case 'openEditDialog':
      store.selectRow(msg.rowIndex);
      store.update({ sidePanelVisible: true });
      break;

    case 'setQuery':
      store.update({ queryScript: msg.script });
      if (msg.run) {
        postMessageToHost<PanelToHost>({
          type: 'runQuery',
          script: msg.script,
        });
      }
      break;
  }
});

// Signal ready
postMessageToHost<PanelToHost>({ type: 'ready' });
