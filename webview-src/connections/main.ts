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

const rawState = getWebviewState<Partial<TreeViewState>>(DEFAULT_STATE);
let currentState: TreeViewState = {
  expandedServers: Array.isArray(rawState?.expandedServers) ? rawState.expandedServers : [],
  expandedCategories:
    rawState?.expandedCategories && typeof rawState.expandedCategories === 'object'
      ? rawState.expandedCategories
      : {},
  filterText: typeof rawState?.filterText === 'string' ? rawState.filterText : '',
};
let currentServers: Array<ServerConfig & { state: ConnectionState; categories?: CategoryInfo[]; error?: string }> = [];
let visibleCategoryKinds: CollectionKind[] = [];
const autoExpandedServers = new Set<string>();
const refreshingServerIds = new Set<string>();

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
const refreshAllBtn = document.getElementById('refresh-all-btn') as HTMLButtonElement | null;
const treeRoot = document.getElementById('tree-root') as HTMLDivElement;
const emptyState = document.getElementById('empty-state') as HTMLDivElement;
const addServerBtn = document.getElementById('add-server-btn') as HTMLButtonElement;
const cloudServerBtn = document.getElementById('cloud-server-btn') as HTMLButtonElement | null;

interface ContextMenuItem {
  label?: string;
  icon?: string;
  command?: string;
  arg?: Record<string, unknown>;
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  header?: string;
}

function getOrCreateContextMenuEl(): HTMLDivElement {
  let el = document.getElementById('tree-context-menu') as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'tree-context-menu';
    el.className = 'tree-context-menu';
    el.setAttribute('role', 'menu');
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

function hideTreeContextMenu(): void {
  const el = document.getElementById('tree-context-menu') as HTMLDivElement | null;
  if (el) {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function showTreeContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  const menuEl = getOrCreateContextMenuEl();
  menuEl.innerHTML = '';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-menu-separator';
      menuEl.appendChild(sep);
      continue;
    }
    if (item.header) {
      const hdr = document.createElement('div');
      hdr.className = 'ctx-menu-header';
      hdr.textContent = item.header;
      menuEl.appendChild(hdr);
      continue;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ctx-menu-item ${item.danger ? 'ctx-menu-danger' : ''}`;
    btn.setAttribute('role', 'menuitem');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'ctx-menu-icon';
    iconSpan.textContent = item.icon || '';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'ctx-menu-label';
    labelSpan.textContent = item.label || '';

    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);

    btn.onclick = (ev) => {
      ev.stopPropagation();
      hideTreeContextMenu();
      if (item.onClick) {
        item.onClick();
      } else if (item.command) {
        postMessageToHost<ConnToHost>({
          type: 'contextAction',
          command: item.command,
          arg: item.arg,
        });
      }
    };

    menuEl.appendChild(btn);
  }

  menuEl.style.display = 'flex';
  const vw = window.innerWidth || 260;
  const vh = window.innerHeight || 500;
  const rect = menuEl.getBoundingClientRect();
  const clampedX = Math.max(4, Math.min(x, vw - (rect.width || 190) - 6));
  const clampedY = Math.max(4, Math.min(y, vh - (rect.height || 240) - 6));
  menuEl.style.left = `${clampedX}px`;
  menuEl.style.top = `${clampedY}px`;
}

document.addEventListener('click', () => {
  hideTreeContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTreeContextMenu();
  }
});
document.addEventListener('contextmenu', (e) => {
  // Always suppress default browser Copy/Paste context menu inside the Connections tree
  if ((e.target as HTMLElement)?.tagName !== 'INPUT') {
    e.preventDefault();
  }
});

function saveState() {
  setWebviewState(currentState);
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const escaped = escapeHtml(text);
  return escaped.replace(regex, '<span class="highlight-match">$1</span>');
}

interface ParsedServerMeta {
  displayName: string;
  isCloud: boolean;
  hostLabel: string;
  expireShort: string | null;
  expireTooltip: string | null;
  expireStatus: 'ok' | 'warning' | 'expired';
}

/**
 * Normalizes both structured ServerConfig fields and legacy concatenated server names
 * (e.g. "☁️ temp-db-0bu9vb [Exp: 2026-10-31 17:15] (axar-tmp-0bu9vb-bt0f)")
 * into clean, structured UI metadata.
 */
function parseServerDisplayMeta(server: ServerConfig): ParsedServerMeta {
  let cleanName = server.name.trim();
  let extractedExp: string | undefined = server.expiresAt;
  let extractedSub: string | undefined = server.subdomain;

  const hasCloudEmoji = cleanName.startsWith('☁️') || cleanName.startsWith('☁');
  cleanName = cleanName.replace(/^☁️?\s*/, '');

  const expMatch = cleanName.match(/\[Exp:\s*([^\]]+)\]/i);
  if (expMatch && expMatch[1]) {
    if (!extractedExp) {
      extractedExp = expMatch[1].trim();
    }
    cleanName = cleanName.replace(expMatch[0], '').trim();
  }

  const subMatch = cleanName.match(/\(([a-z0-9-]+)\)\s*$/i);
  if (subMatch && subMatch[1]) {
    if (!extractedSub) {
      extractedSub = subMatch[1].trim();
    }
    cleanName = cleanName.replace(subMatch[0], '').trim();
  }

  const isCloud = Boolean(
    server.isCloud ||
      hasCloudEmoji ||
      server.url.toLowerCase().includes('.axardb.com')
  );

  let hostLabel = server.url;
  try {
    const u = new URL(server.url);
    hostLabel = u.host;
  } catch {
    if (extractedSub) {
      hostLabel = `${extractedSub}.axardb.com`;
    }
  }

  let expireShort: string | null = null;
  let expireTooltip: string | null = null;
  let expireStatus: 'ok' | 'warning' | 'expired' = 'ok';

  if (extractedExp) {
    const parsedMs = Date.parse(extractedExp.replace(' ', 'T'));
    if (!Number.isNaN(parsedMs)) {
      const diffMs = parsedMs - Date.now();
      const d = new Date(parsedMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      const fullStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

      if (diffMs <= 0) {
        expireShort = 'Expired';
        expireTooltip = `Expired at ${fullStr}`;
        expireStatus = 'expired';
      } else {
        const diffMins = Math.ceil(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.ceil(diffMs / 86400000);

        if (diffHours < 24) {
          expireShort = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          expireTooltip = `Expires today at ${fullStr} (${diffMins < 60 ? `${diffMins}m` : `${diffHours}h`} left)`;
          expireStatus = 'warning';
        } else {
          expireShort = `${diffDays}d`;
          expireTooltip = `Expires: ${fullStr} (${diffDays} days left)`;
          expireStatus = diffDays <= 3 ? 'warning' : 'ok';
        }
      }
    } else {
      const timePart = extractedExp.split(' ')[1] || extractedExp;
      expireShort = timePart;
      expireTooltip = `Expires: ${extractedExp}`;
      expireStatus = 'warning';
    }
  }

  return {
    displayName: cleanName || server.name,
    isCloud,
    hostLabel,
    expireShort,
    expireTooltip,
    expireStatus,
  };
}

function triggerServerRefresh(serverId: string) {
  refreshingServerIds.add(serverId);
  if (!currentState.expandedServers.includes(serverId)) {
    currentState.expandedServers.push(serverId);
    saveState();
  }
  renderTree();
  postMessageToHost<ConnToHost>({ type: 'refresh', serverId });
  setTimeout(() => {
    refreshingServerIds.delete(serverId);
    renderTree();
  }, 600);
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
    // Auto-expand newly connected servers once so categories are immediately visible
    if (server.state === 'connected' && !autoExpandedServers.has(server.id)) {
      autoExpandedServers.add(server.id);
      if (!currentState.expandedServers.includes(server.id)) {
        currentState.expandedServers.push(server.id);
        saveState();
      }
    }

    const isExpanded = currentState.expandedServers.includes(server.id) || filter.length > 0;
    const meta = parseServerDisplayMeta(server);
    const isRefreshing = refreshingServerIds.has(server.id) || server.state === 'connecting';

    const serverNode = document.createElement('div');
    serverNode.className = `tree-node server-node ${isExpanded ? 'server-expanded' : ''}`;
    serverNode.tabIndex = 0;
    serverNode.setAttribute('role', 'treeitem');
    serverNode.setAttribute('aria-expanded', String(isExpanded));
    serverNode.setAttribute('data-vscode-context', JSON.stringify({
      webviewSection: 'server',
      serverId: server.id,
      serverState: server.state,
      preventDefaultContextMenuItems: true,
    }));

    if (server.color) {
      serverNode.style.borderLeftColor = server.color;
    }

    const chevron = document.createElement('span');
    chevron.className = `chevron ${isExpanded ? 'expanded' : ''}`;
    chevron.textContent = '▶';

    const statusDot = document.createElement('span');
    statusDot.className = `status-dot status-${server.state}`;
    statusDot.title = `Status: ${server.state}`;

    const infoCol = document.createElement('div');
    infoCol.className = 'server-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'server-title-row';

    const label = document.createElement('span');
    label.className = 'server-label';
    label.textContent = meta.displayName;
    label.title = `${meta.displayName} (${meta.hostLabel})`;
    titleRow.appendChild(label);

    if (meta.isCloud) {
      const cloudBadge = document.createElement('span');
      cloudBadge.className = 'server-pill pill-cloud';
      cloudBadge.textContent = '☁️ CLOUD';
      cloudBadge.title = `AxarDB Cloud (${meta.hostLabel})`;
      titleRow.appendChild(cloudBadge);
    }

    if (meta.expireShort) {
      const expBadge = document.createElement('span');
      expBadge.className = `server-pill pill-exp-${meta.expireStatus}`;
      expBadge.textContent = `⏳ ${meta.expireShort}`;
      if (meta.expireTooltip) {
        expBadge.title = meta.expireTooltip;
      }
      titleRow.appendChild(expBadge);
    }

    const subtitleRow = document.createElement('div');
    subtitleRow.className = 'server-subtitle-row';

    const hostSpan = document.createElement('span');
    hostSpan.className = 'server-host-text';
    hostSpan.textContent = meta.hostLabel;
    hostSpan.title = server.url;
    subtitleRow.appendChild(hostSpan);

    infoCol.appendChild(titleRow);
    infoCol.appendChild(subtitleRow);

    // Inline Quick Actions (Refresh + Connect/Disconnect)
    const actionsCol = document.createElement('div');
    actionsCol.className = 'server-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = `tree-action-btn ${isRefreshing ? 'spinning' : ''}`;
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh Server & Collections';
    refreshBtn.setAttribute('aria-label', `Refresh ${meta.displayName}`);
    refreshBtn.onclick = (e) => {
      e.stopPropagation();
      triggerServerRefresh(server.id);
    };
    actionsCol.appendChild(refreshBtn);

    serverNode.appendChild(chevron);
    serverNode.appendChild(statusDot);
    serverNode.appendChild(infoCol);
    serverNode.appendChild(actionsCol);

    serverNode.onclick = (e) => {
      e.stopPropagation();
      if (server.state === 'disconnected' || server.state === 'error') {
        if (!currentState.expandedServers.includes(server.id)) {
          currentState.expandedServers.push(server.id);
          saveState();
        }
        postMessageToHost<ConnToHost>({ type: 'connect', serverId: server.id });
      } else {
        toggleServer(server.id);
        // If expanding and categories aren't loaded yet, fetch them automatically
        if (currentState.expandedServers.includes(server.id) && !server.categories) {
          postMessageToHost<ConnToHost>({ type: 'refresh', serverId: server.id });
        }
      }
    };

    serverNode.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [];
      if (server.state === 'connected') {
        items.push({
          icon: '🔌',
          label: 'Disconnect',
          onClick: () => postMessageToHost<ConnToHost>({ type: 'disconnect', serverId: server.id }),
        });
      } else {
        items.push({
          icon: '🔌',
          label: 'Connect',
          onClick: () => postMessageToHost<ConnToHost>({ type: 'connect', serverId: server.id }),
        });
      }
      items.push(
        {
          icon: '🔄',
          label: 'Refresh Server',
          onClick: () => triggerServerRefresh(server.id),
        },
        { separator: true },
        {
          icon: '📝',
          label: 'New AxarDB Playground',
          command: 'axardb.query.newEditor',
          arg: { serverId: server.id },
        },
        {
          icon: '📋',
          label: 'All System Logs (syslogs)',
          command: 'axardb.collection.logs.all',
          arg: { serverId: server.id, collection: 'syslogs', kind: 'log' },
        },
        { separator: true },
        {
          icon: '✏️',
          label: 'Edit Connection',
          command: 'axardb.server.edit',
          arg: { serverId: server.id },
        },
        {
          icon: '🗑️',
          label: 'Remove Connection',
          command: 'axardb.server.remove',
          arg: { serverId: server.id },
          danger: true,
        }
      );
      showTreeContextMenu(e.clientX, e.clientY, items);
    };

    treeRoot.appendChild(serverNode);

    if (server.error && isExpanded) {
      const errBanner = document.createElement('div');
      errBanner.className = 'server-error-row';
      errBanner.textContent = `⚠️ ${server.error}`;
      treeRoot.appendChild(errBanner);
    }

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
      preventDefaultContextMenuItems: true,
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

    const catRefreshBtn = document.createElement('button');
    catRefreshBtn.type = 'button';
    catRefreshBtn.className = 'tree-action-btn category-refresh-btn';
    catRefreshBtn.textContent = '↻';
    catRefreshBtn.title = `Refresh ${cat.label}`;
    catRefreshBtn.setAttribute('aria-label', `Refresh ${cat.label}`);
    catRefreshBtn.onclick = (e) => {
      e.stopPropagation();
      triggerServerRefresh(serverId);
    };

    const badge = document.createElement('span');
    badge.className = `category-badge ${cat.items.length === 0 ? 'badge-dimmed' : ''}`;
    badge.textContent = filter ? `${filteredItems.length}/${cat.items.length}` : String(cat.items.length);

    catNode.appendChild(chevron);
    catNode.appendChild(icon);
    catNode.appendChild(label);
    catNode.appendChild(catRefreshBtn);
    catNode.appendChild(badge);

    catNode.onclick = (e) => {
      e.stopPropagation();
      toggleCategory(serverId, cat.kind);
    };

    catNode.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultCol = cat.items[0]?.name || (cat.kind === 'log' ? 'syslogs' : 'users');
      const items: ContextMenuItem[] = [
        {
          icon: '🔄',
          label: `Refresh ${cat.label}`,
          onClick: () => triggerServerRefresh(serverId),
        },
        {
          icon: '📝',
          label: 'New AxarDB Playground',
          command: 'axardb.query.newEditor',
          arg: { serverId, collection: defaultCol },
        },
        { separator: true },
        { header: 'QUERY TEMPLATES' },
        {
          icon: '🔍',
          label: 'find(predicate)',
          command: 'axardb.collection.template.find',
          arg: { serverId, collection: defaultCol, kind: cat.kind },
        },
        {
          icon: '➕',
          label: 'insert({...})',
          command: 'axardb.collection.template.insert',
          arg: { serverId, collection: defaultCol, kind: cat.kind },
        },
        {
          icon: '✏️',
          label: 'update(predicate, patch)',
          command: 'axardb.collection.template.update',
          arg: { serverId, collection: defaultCol, kind: cat.kind },
        },
        {
          icon: '🗑️',
          label: 'delete(predicate)',
          command: 'axardb.collection.template.delete',
          arg: { serverId, collection: defaultCol, kind: cat.kind },
        },
        { separator: true },
        {
          icon: '📋',
          label: 'All System Logs (syslogs)',
          command: 'axardb.collection.logs.all',
          arg: { serverId, collection: defaultCol, kind: cat.kind },
        },
        {
          icon: '📁',
          label: 'Collapse Category',
          onClick: () => {
            const list = currentState.expandedCategories[serverId];
            if (list) {
              const idx = list.indexOf(cat.kind);
              if (idx !== -1) {
                list.splice(idx, 1);
                saveState();
                renderTree();
              }
            }
          },
        },
      ];
      showTreeContextMenu(e.clientX, e.clientY, items);
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
    preventDefaultContextMenuItems: true,
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

  itemNode.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const colArg = { serverId, collection: item.name, kind };
    const items: ContextMenuItem[] = [];

    if (kind !== 'view' && kind !== 'trigger') {
      items.push({
        icon: '📊',
        label: 'View Data',
        onClick: () =>
          postMessageToHost<ConnToHost>({
            type: 'openCollection',
            serverId,
            collection: item.name,
            kind,
          }),
      });
    }

    items.push(
      {
        icon: '📝',
        label: 'New AxarDB Playground',
        command: 'axardb.query.newEditor',
        arg: colArg,
      },
      {
        icon: '📋',
        label: 'Copy Collection Name',
        command: 'axardb.collection.copyName',
        arg: colArg,
      }
    );

    if (kind === 'db' || kind === 'system' || kind === 'memory' || kind === 'bulk') {
      items.push(
        { separator: true },
        { header: 'QUERY TEMPLATES' },
        { icon: '🔍', label: 'find(predicate)', command: 'axardb.collection.template.find', arg: colArg },
        { icon: '🎯', label: 'find by _id', command: 'axardb.collection.template.findOne', arg: colArg },
        { icon: '🔢', label: 'count()', command: 'axardb.collection.template.count', arg: colArg },
        { icon: '➕', label: 'insert({...})', command: 'axardb.collection.template.insert', arg: colArg },
        { icon: '✏️', label: 'update(predicate, patch)', command: 'axardb.collection.template.update', arg: colArg },
        { icon: '✏️', label: 'updateById(_id, patch)', command: 'axardb.collection.template.updateById', arg: colArg },
        { icon: '🗑️', label: 'delete(predicate)', command: 'axardb.collection.template.delete', arg: colArg },
        { icon: '🗑️', label: 'deleteById(_id)', command: 'axardb.collection.template.deleteById', arg: colArg },
        { separator: true },
        { header: 'EXPORT COLLECTION' },
        { icon: '📤', label: 'Export as JSON Array...', command: 'axardb.collection.exportJson', arg: colArg },
        { icon: '📤', label: 'Export as JSON Lines (JSONL)...', command: 'axardb.collection.exportJsonl', arg: colArg },
        { icon: '📤', label: 'Export as CSV...', command: 'axardb.collection.exportCsv', arg: colArg }
      );
    }

    if (kind === 'db' || kind === 'system' || kind === 'log') {
      items.push(
        { separator: true },
        { header: 'COLLECTION LOGS' },
        { icon: '📋', label: 'All System Logs (syslogs)', command: 'axardb.collection.logs.all', arg: colArg },
        { icon: '🌐', label: 'Request Logs', command: 'axardb.collection.logs.request', arg: colArg },
        { icon: '❌', label: 'Error Logs', command: 'axardb.collection.logs.error', arg: colArg },
        { icon: '🐞', label: 'Debug Logs', command: 'axardb.collection.logs.debug', arg: colArg },
        { icon: '💾', label: 'Backup & Recovery Logs', command: 'axardb.collection.logs.backup', arg: colArg }
      );
    }

    if (kind === 'view') {
      items.push(
        { separator: true },
        { icon: '👁️', label: 'Open View Script', command: 'axardb.view.open', arg: colArg },
        { icon: '▶️', label: 'Execute View', command: 'axardb.view.run', arg: colArg },
        { icon: '🗑️', label: 'Delete View', command: 'axardb.view.delete', arg: colArg, danger: true }
      );
    }

    if (kind === 'trigger') {
      items.push(
        { separator: true },
        { icon: '⚡', label: 'Open Trigger Script', command: 'axardb.trigger.open', arg: colArg },
        { icon: '🗑️', label: 'Delete Trigger', command: 'axardb.trigger.delete', arg: colArg, danger: true }
      );
    }

    if (kind === 'db') {
      items.push(
        { separator: true },
        { icon: '🗑️', label: 'Drop Collection', command: 'axardb.collection.drop', arg: colArg, danger: true }
      );
    }

    showTreeContextMenu(e.clientX, e.clientY, items);
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

refreshAllBtn?.addEventListener('click', () => {
  refreshAllBtn.classList.add('spinning');
  postMessageToHost<ConnToHost>({ type: 'refresh' });
  setTimeout(() => {
    refreshAllBtn.classList.remove('spinning');
  }, 600);
});

addServerBtn?.addEventListener('click', () => {
  postMessageToHost<ConnToHost>({ type: 'addServer' });
});

cloudServerBtn?.addEventListener('click', () => {
  postMessageToHost<ConnToHost>({ type: 'openCloud' });
});

onHostMessage<HostToConn>((msg) => {
  switch (msg.type) {
    case 'state':
      if (!Array.isArray(msg.servers)) {
        break;
      }
      currentServers = msg.servers;
      visibleCategoryKinds = Array.isArray(msg.visibleCategories) ? msg.visibleCategories : [];
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
