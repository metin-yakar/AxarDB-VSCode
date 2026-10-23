import {
  postMessageToHost,
  onHostMessage,
  getWebviewState,
  setWebviewState,
} from '../shared/vscodeApi.js';
import { escapeHtml } from '../shared/jsonHighlight.js';
import {
  ConnToHost,
  HostToConn,
} from '../../src/contracts/messages.js';
import {
  ServerConfig,
  ConnectionState,
  CategoryInfo,
  CollectionInfo,
  CollectionKind,
} from '../../src/contracts/types.js';

interface TreeViewState {
  expandedServers: string[];
  expandedCategories: Record<string, string[]>; // serverId -> kind[]
  filterText: string;
}

const DEFAULT_STATE: TreeViewState = {
  expandedServers: [],
  expandedCategories: {},
  filterText: '',
};

let currentState: TreeViewState = getWebviewState<TreeViewState>(DEFAULT_STATE);
let currentServers: Array<ServerConfig & { state: ConnectionState; categories?: CategoryInfo[]; error?: string }> = [];
let visibleCategoryKinds: CollectionKind[] = [];

const CATEGORY_ICONS: Record<string, string> = {
  db: '📁',
  system: '⚙️',
  log: '📝',
  memory: '⚡',
  bulk: '📦',
  view: '👁️',
  trigger: '⚡',
};

const filterInput = document.getElementById('filter-input') as HTMLInputElement;
const filterClearBtn = document.getElementById('filter-clear') as HTMLButtonElement;
const treeRoot = document.getElementById('tree-root') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const addServerBtn = document.getElementById('add-server-btn') as HTMLButtonElement;

function saveState() {
  setWebviewState(currentState);
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const escaped = escapeHtml(text);
  return escaped.replace(regex, '<span class="highlight-match">$1</span>');
}

function renderTree() {
  if (currentServers.length === 0) {
    treeRoot.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  treeRoot.innerHTML = '';

  const filter = currentState.filterText.trim().toLowerCase();

  for (const server of currentServers) {
    const isExpanded = currentState.expandedServers.includes(server.id) || filter.length > 0;
    const serverNode = document.createElement('div');
    serverNode.className = 'tree-node server-node';
    serverNode.tabIndex = 0;
    serverNode.setAttribute('role', 'treeitem');
    serverNode.setAttribute('aria-expanded', String(isExpanded));
    serverNode.setAttribute('data-vscode-context', JSON.stringify({
      webviewSection: 'server',
      serverId: server.id,
      serverState: server.state,
    }));

    const chevron = document.createElement('span');
    chevron.className = `chevron ${isExpanded ? 'expanded' : ''}`;
    chevron.textContent = '▶';

    const statusDot = document.createElement('span');
    statusDot.className = `status-dot status-${server.state}`;
    if (server.color) {
      statusDot.style.backgroundColor = server.color;
    }

    const label = document.createElement('span');
    label.className = 'server-label';
    label.textContent = server.name;

    serverNode.appendChild(chevron);
    serverNode.appendChild(statusDot);
    serverNode.appendChild(label);

    serverNode.onclick = (e) => {
      e.stopPropagation();
      if (server.state === 'disconnected') {
        postMessageToHost<ConnToHost>({ type: 'connect', serverId: server.id });
      } else {
        toggleServer(server.id);
      }
    };

    treeRoot.appendChild(serverNode);

    if (isExpanded && server.state === 'connected' && server.categories) {
      renderCategories(server.id, server.categories, filter);
    }
  }
}

function renderCategories(serverId: string, categories: CategoryInfo[], filter: string) {
  const expandedList = currentState.expandedCategories[serverId] || ['db'];

  for (const cat of categories) {
    if (visibleCategoryKinds.length > 0 && !visibleCategoryKinds.includes(cat.kind)) {
      continue;
    }

    const filteredItems = filter
      ? cat.items.filter((item) => item.name.toLowerCase().includes(filter))
      : cat.items;

    // In filter mode, hide category if no matches
    if (filter && filteredItems.length === 0) {
      continue;
    }

    const isCatExpanded = filter ? true : expandedList.includes(cat.kind);

    const catNode = document.createElement('div');
    catNode.className = 'tree-node category-node';
    catNode.tabIndex = 0;
    catNode.setAttribute('role', 'treeitem');
    catNode.setAttribute('aria-expanded', String(isCatExpanded));
    catNode.setAttribute('data-vscode-context', JSON.stringify({
      webviewSection: 'category',
      serverId,
      kind: cat.kind,
    }));

    const chevron = document.createElement('span');
    chevron.className = `chevron ${isCatExpanded ? 'expanded' : ''}`;
    chevron.textContent = '▶';

    const icon = document.createElement('span');
    icon.className = 'category-icon';
    icon.textContent = CATEGORY_ICONS[cat.kind] || '📁';

    const label = document.createElement('span');
    label.className = 'category-label';
    label.textContent = cat.label;

    const badge = document.createElement('span');
    badge.className = `category-badge ${cat.items.length === 0 ? 'badge-dimmed' : ''}`;
    badge.textContent = filter ? `${filteredItems.length}/${cat.items.length}` : String(cat.items.length);

    catNode.appendChild(chevron);
    catNode.appendChild(icon);
    catNode.appendChild(label);
    catNode.appendChild(badge);

    catNode.onclick = (e) => {
      e.stopPropagation();
      toggleCategory(serverId, cat.kind);
    };

    treeRoot.appendChild(catNode);

    if (isCatExpanded) {
      for (const item of filteredItems) {
        renderCollectionItem(serverId, cat.kind, item, filter);
      }
    }
  }
}

function renderCollectionItem(serverId: string, kind: CollectionKind, item: CollectionInfo, filter: string) {
  const itemNode = document.createElement('div');
  itemNode.className = 'tree-node collection-node';
  itemNode.tabIndex = 0;
  itemNode.setAttribute('role', 'treeitem');
  itemNode.setAttribute('data-vscode-context', JSON.stringify({
    webviewSection: 'collection',
    serverId,
    collection: item.name,
    kind,
  }));

  const icon = document.createElement('span');
  icon.className = 'collection-icon';
  icon.textContent = '📄';

  const name = document.createElement('span');
  name.className = 'collection-name';
  name.innerHTML = highlightMatch(item.name, filter);

  itemNode.appendChild(icon);
  itemNode.appendChild(name);

  if (item.count !== undefined) {
    const count = document.createElement('span');
    count.className = 'collection-count';
    count.textContent = `(${item.count})`;
    itemNode.appendChild(count);
  }

  itemNode.onclick = (e) => {
    e.stopPropagation();
    postMessageToHost<ConnToHost>({
      type: 'openCollection',
      serverId,
      collection: item.name,
      kind,
    });
  };

  treeRoot.appendChild(itemNode);
}

function toggleServer(serverId: string) {
  const idx = currentState.expandedServers.indexOf(serverId);
  if (idx !== -1) {
    currentState.expandedServers.splice(idx, 1);
  } else {
    currentState.expandedServers.push(serverId);
  }
  saveState();
  renderTree();
}

function toggleCategory(serverId: string, kind: string) {
  if (!currentState.expandedCategories[serverId]) {
    currentState.expandedCategories[serverId] = ['db'];
  }
  const list = currentState.expandedCategories[serverId];
  const idx = list.indexOf(kind);
  if (idx !== -1) {
    list.splice(idx, 1);
  } else {
    list.push(kind);
  }
  saveState();
  renderTree();
}

// Events
filterInput.addEventListener('input', () => {
  currentState.filterText = filterInput.value;
  filterClearBtn.style.display = filterInput.value ? 'inline-block' : 'none';
  postMessageToHost<ConnToHost>({ type: 'filterChanged', text: filterInput.value });
  saveState();
  renderTree();
});

filterClearBtn.addEventListener('click', () => {
  filterInput.value = '';
  currentState.filterText = '';
  filterClearBtn.style.display = 'none';
  postMessageToHost<ConnToHost>({ type: 'filterChanged', text: '' });
  saveState();
  renderTree();
  filterInput.focus();
});

filterInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    filterInput.value = '';
    currentState.filterText = '';
    filterClearBtn.style.display = 'none';
    saveState();
    renderTree();
  }
});

addServerBtn?.addEventListener('click', () => {
  postMessageToHost<ConnToHost>({ type: 'addServer' });
});

onHostMessage<HostToConn>((msg) => {
  switch (msg.type) {
    case 'state':
      currentServers = msg.servers;
      visibleCategoryKinds = msg.visibleCategories;
      if (msg.filter !== undefined && msg.filter !== currentState.filterText) {
        currentState.filterText = msg.filter;
        filterInput.value = msg.filter;
        filterClearBtn.style.display = msg.filter ? 'inline-block' : 'none';
      }
      renderTree();
      break;

    case 'focusFilter':
      filterInput.focus();
      filterInput.select();
      break;
  }
});

// Initial boot
filterInput.value = currentState.filterText;
filterClearBtn.style.display = filterInput.value ? 'inline-block' : 'none';
postMessageToHost<ConnToHost>({ type: 'ready' });
