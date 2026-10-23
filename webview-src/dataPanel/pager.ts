import { store } from './store.js';
import { postMessageToHost } from '../shared/vscodeApi.js';
import { PanelToHost } from '../../src/contracts/messages.js';

export class Pager {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public render(): void {
    const state = store.getState();
    this.container.innerHTML = '';
    this.container.className = 'data-pager';
    this.container.style.display = 'flex';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'space-between';
    this.container.style.padding = '4px 10px';
    this.container.style.borderTop = '1px solid var(--border-color)';
    this.container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
    this.container.style.fontSize = '12px';

    // Left info
    const leftInfo = document.createElement('div');
    leftInfo.style.display = 'flex';
    leftInfo.style.alignItems = 'center';
    leftInfo.style.gap = '8px';

    const start = state.docs.length > 0 ? state.skip + 1 : 0;
    const end = state.skip + state.docs.length;
    const countSpan = document.createElement('span');
    countSpan.textContent = `${start}–${end} of ${state.total}`;
    leftInfo.appendChild(countSpan);

    if (state.elapsedMs > 0) {
      const elapsedSpan = document.createElement('span');
      elapsedSpan.style.color = 'var(--vscode-descriptionForeground)';
      elapsedSpan.textContent = `(${state.elapsedMs}ms)`;
      leftInfo.appendChild(elapsedSpan);
    }

    this.container.appendChild(leftInfo);

    // Right navigation & page size selector
    const rightNav = document.createElement('div');
    rightNav.style.display = 'flex';
    rightNav.style.alignItems = 'center';
    rightNav.style.gap = '6px';

    const pageSizeSelect = document.createElement('select');
    pageSizeSelect.style.padding = '2px 4px';
    pageSizeSelect.style.fontSize = '11px';
    [20, 50, 100, 200].forEach((sz) => {
      const opt = document.createElement('option');
      opt.value = String(sz);
      opt.textContent = `${sz} / page`;
      if (sz === state.pageSize) opt.selected = true;
      pageSizeSelect.appendChild(opt);
    });
    pageSizeSelect.onchange = () => {
      const newSize = Number(pageSizeSelect.value);
      store.update({ pageSize: newSize, skip: 0 });
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: 0, take: newSize },
      });
    };
    rightNav.appendChild(pageSizeSelect);

    const canPrev = state.skip > 0;
    const canNext = state.skip + state.docs.length < state.total;

    const firstBtn = document.createElement('button');
    firstBtn.className = 'icon-btn';
    firstBtn.textContent = '⏮';
    firstBtn.disabled = !canPrev;
    firstBtn.title = 'First Page';
    firstBtn.onclick = () => {
      store.update({ skip: 0 });
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: 0, take: state.pageSize },
      });
    };
    rightNav.appendChild(firstBtn);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'icon-btn';
    prevBtn.textContent = '◀';
    prevBtn.disabled = !canPrev;
    prevBtn.title = 'Previous Page';
    prevBtn.onclick = () => {
      const newSkip = Math.max(0, state.skip - state.pageSize);
      store.update({ skip: newSkip });
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: newSkip, take: state.pageSize },
      });
    };
    rightNav.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'icon-btn';
    nextBtn.textContent = '▶';
    nextBtn.disabled = !canNext;
    nextBtn.title = 'Next Page';
    nextBtn.onclick = () => {
      const newSkip = state.skip + state.pageSize;
      store.update({ skip: newSkip });
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: newSkip, take: state.pageSize },
      });
    };
    rightNav.appendChild(nextBtn);

    const lastBtn = document.createElement('button');
    lastBtn.className = 'icon-btn';
    lastBtn.textContent = '⏭';
    lastBtn.disabled = !canNext;
    lastBtn.title = 'Last Page';
    lastBtn.onclick = () => {
      const lastPageSkip = Math.floor(Math.max(0, state.total - 1) / state.pageSize) * state.pageSize;
      store.update({ skip: lastPageSkip });
      postMessageToHost<PanelToHost>({
        type: 'loadPage',
        req: { skip: lastPageSkip, take: state.pageSize },
      });
    };
    rightNav.appendChild(lastBtn);

    this.container.appendChild(rightNav);
  }
}
