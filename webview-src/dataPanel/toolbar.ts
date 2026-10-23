import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class Toolbar {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    const state = store.getState();
    this.container.innerHTML = '';
    this.container.className = 'data-toolbar';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'space-between';
    this.container.style.padding = '6px 10px';
    this.container.style.borderBottom = '1px solid var(--border-color)';
    this.container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';

    // Left buttons
    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '6px';

    if (!state.readOnly) {
      const addBtn = document.createElement('button');
      addBtn.id = 'toolbar-insert';
      addBtn.innerHTML = '➕ <span>Add Record</span>';
      addBtn.onclick = () => {
        const sampleDoc = state.docs[0];
        window.dispatchEvent(new CustomEvent('axardb:openInsert', { detail: sampleDoc }));
      };
      leftGroup.appendChild(addBtn);
    }

    const historyBtn = document.createElement('button');
    historyBtn.id = 'toolbar-history';
    historyBtn.className = 'secondary';
    historyBtn.innerHTML = '🕘 <span>History</span>';
    historyBtn.onclick = () => {
      postMessageToHost<PanelToHost>({ type: 'requestHistory' });
    };
    leftGroup.appendChild(historyBtn);

    const exportBtn = document.createElement('button');
    exportBtn.id = 'toolbar-export';
    exportBtn.className = 'secondary';
    exportBtn.innerHTML = '⤓ <span>Export</span>';
    exportBtn.onclick = () => {
      window.dispatchEvent(new CustomEvent('axardb:openExport'));
    };
    leftGroup.appendChild(exportBtn);

    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'toolbar-refresh';
    refreshBtn.className = 'icon-btn';
    refreshBtn.innerHTML = '⟳';
    refreshBtn.title = 'Refresh';
    refreshBtn.onclick = () => {
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: state.skip, take: state.pageSize },
      });
    };
    leftGroup.appendChild(refreshBtn);

    this.container.appendChild(leftGroup);

    // Right group (view mode toggle & side panel toggle)
    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.gap = '6px';

    const modeBtn = document.createElement('button');
    modeBtn.id = 'mode-toggle';
    modeBtn.className = 'secondary';
    modeBtn.innerHTML = state.mode === 'grid' ? '🗂️ <span>JSON Mode</span>' : '📊 <span>Grid Mode</span>';
    modeBtn.onclick = () => {
      const nextMode = state.mode === 'grid' ? 'json' : 'grid';
      store.update({ mode: nextMode });
      postMessageToHost<PanelToHost>({ type: 'setMode', mode: nextMode });
    };
    rightGroup.appendChild(modeBtn);

    const sidePanelToggle = document.createElement('button');
    sidePanelToggle.id = 'sidepanel-toggle';
    sidePanelToggle.className = `icon-btn ${state.sidePanelVisible ? 'active' : ''}`;
    sidePanelToggle.innerHTML = '◨';
    sidePanelToggle.title = state.sidePanelVisible ? 'Hide Side Panel' : 'Show Side Panel';
    sidePanelToggle.onclick = () => {
      store.update({ sidePanelVisible: !state.sidePanelVisible });
    };
    rightGroup.appendChild(sidePanelToggle);

    this.container.appendChild(rightGroup);
  }
}
