import {
  postMessageToHost,
  onHostMessage,
  getWebviewState,
  setWebviewState,
} from '../shared/vscodeApi.js';
import { escapeHtml } from '../shared/jsonHighlight.js';
import { DocsToHost, HostToDocs } from '../../src/contracts/messages.js';
import {
  DocCategoryId,
  DocSearchFieldScope,
} from '../../src/contracts/types.js';
import {
  AXAR_DOCS_CATALOG,
  filterDocsCatalog,
  FilteredDocCategoryResult,
  FilteredDocTopicResult,
} from '../../src/docs/axarDocsCatalog.js';

interface DocsViewState {
  expandedCategories: DocCategoryId[];
  selectedTopicId: string | null;
  globalQuery: string;
  selectedCategory: DocCategoryId | 'all';
  fieldScope: DocSearchFieldScope;
  scopedBarOpen: boolean;
  openCategorySearch: DocCategoryId[];
  categoryQueries: Partial<Record<DocCategoryId, string>>;
}

const DEFAULT_STATE: DocsViewState = {
  expandedCategories: ['getting-started', 'javascript-api'],
  selectedTopicId: null,
  globalQuery: '',
  selectedCategory: 'all',
  fieldScope: 'all',
  scopedBarOpen: false,
  openCategorySearch: [],
  categoryQueries: {},
};

let state: DocsViewState = {
  ...DEFAULT_STATE,
  ...getWebviewState<DocsViewState>(DEFAULT_STATE),
};

const globalSearchInput = document.getElementById('docs-global-search') as HTMLInputElement;
const clearSearchBtn = document.getElementById('docs-search-clear') as HTMLButtonElement;
const toggleAdvancedBtn = document.getElementById('docs-toggle-advanced') as HTMLButtonElement;
const scopedBar = document.getElementById('docs-scoped-bar') as HTMLDivElement;
const categorySelect = document.getElementById('docs-category-select') as HTMLSelectElement;
const searchSummary = document.getElementById('docs-search-summary') as HTMLDivElement;
const accordionRoot = document.getElementById('docs-accordion-root') as HTMLDivElement;
const emptyState = document.getElementById('docs-empty-state') as HTMLDivElement;
const resetFiltersBtn = document.getElementById('docs-reset-filters-btn') as HTMLButtonElement;
const scopeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.scope-pill'));

function saveState(): void {
  setWebviewState(state);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTurkishInsensitivePattern(term: string): string {
  const escaped = escapeRegExp(term);
  return escaped.replace(/[iIıİ]/g, '[iIıİ]');
}

function highlightText(text: string, terms: string[]): string {
  const cleanTerms = terms.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleanTerms.length === 0) {
    return escapeHtml(text);
  }
  const escapedText = escapeHtml(text);
  const pattern = cleanTerms.map(buildTurkishInsensitivePattern).join('|');
  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    return escapedText.replace(regex, '<mark class="highlight-match">$1</mark>');
  } catch {
    return escapedText;
  }
}

function hasAnyActiveSearch(): boolean {
  if (state.globalQuery.trim().length > 0) return true;
  if (state.selectedCategory !== 'all') return true;
  for (const val of Object.values(state.categoryQueries)) {
    if (val && val.trim().length > 0) return true;
  }
  return false;
}

function syncToolbarControls(): void {
  globalSearchInput.value = state.globalQuery;
  clearSearchBtn.hidden = state.globalQuery.length === 0;
  scopedBar.hidden = !state.scopedBarOpen;
  toggleAdvancedBtn.setAttribute('aria-expanded', String(state.scopedBarOpen));
  toggleAdvancedBtn.classList.toggle('active', state.scopedBarOpen || state.selectedCategory !== 'all' || state.fieldScope !== 'all');
  categorySelect.value = state.selectedCategory;

  for (const btn of scopeButtons) {
    const btnScope = btn.getAttribute('data-scope') as DocSearchFieldScope;
    const isActive = btnScope === state.fieldScope;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
}

function renderSummaryBar(filteredCategories: FilteredDocCategoryResult[]): void {
  const isSearching = hasAnyActiveSearch();
  if (!isSearching) {
    searchSummary.hidden = true;
    searchSummary.textContent = '';
    return;
  }

  const totalTopics = filteredCategories.reduce((acc, c) => acc + c.matchedTopicCount, 0);
  const totalOccurrences = filteredCategories.reduce((acc, c) => acc + c.totalMatchOccurrences, 0);

  searchSummary.hidden = false;
  searchSummary.innerHTML = '';

  const infoSpan = document.createElement('span');
  infoSpan.className = 'docs-summary-text';
  if (totalOccurrences > 0) {
    infoSpan.textContent = `${totalTopics} topic(s) • ${totalOccurrences} match(es)`;
  } else {
    infoSpan.textContent = `${totalTopics} topic(s) in filter`;
  }

  const resetLink = document.createElement('button');
  resetLink.type = 'button';
  resetLink.id = 'docs-summary-reset-btn';
  resetLink.className = 'docs-summary-reset';
  resetLink.title = 'Clear all search filters';
  resetLink.setAttribute('aria-label', 'Clear all search filters');
  resetLink.textContent = 'Clear filters';
  resetLink.onclick = () => resetAllFilters();

  searchSummary.appendChild(infoSpan);
  searchSummary.appendChild(resetLink);
}

function renderAccordion(): void {
  const filteredCategories = filterDocsCatalog(
    {
      globalQuery: state.globalQuery,
      categoryId: state.selectedCategory,
      fieldScope: state.fieldScope,
      categoryQueries: state.categoryQueries,
    },
    AXAR_DOCS_CATALOG
  );

  renderSummaryBar(filteredCategories);

  const totalTopics = filteredCategories.reduce((acc, c) => acc + c.matchedTopicCount, 0);
  const onlyEmptyWithoutCategoryLocal =
    totalTopics === 0 &&
    !filteredCategories.some((c) => (state.categoryQueries[c.category.id] ?? '').trim().length > 0);

  if (filteredCategories.length === 0 || onlyEmptyWithoutCategoryLocal) {
    accordionRoot.innerHTML = '';
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  accordionRoot.innerHTML = '';

  const globalQueryTrimmed = state.globalQuery.trim();

  for (const catResult of filteredCategories) {
    const cat = catResult.category;
    const catLocalQuery = (state.categoryQueries[cat.id] ?? '').trim();
    const isCatForceExpanded = globalQueryTrimmed.length > 0 || catLocalQuery.length > 0 || state.selectedCategory === cat.id;
    const isCatExpanded = isCatForceExpanded || state.expandedCategories.includes(cat.id);

    const catWrapper = document.createElement('section');
    catWrapper.className = `docs-category-section ${isCatExpanded ? 'expanded' : ''}`;
    catWrapper.id = `doc-cat-${cat.id}`;

    // Category Accordion Header
    const catHeader = document.createElement('div');
    catHeader.className = 'docs-category-header';
    catHeader.id = `doc-cat-header-${cat.id}`;
    catHeader.tabIndex = 0;
    catHeader.setAttribute('role', 'treeitem');
    catHeader.setAttribute('aria-level', '1');
    catHeader.setAttribute('aria-expanded', String(isCatExpanded));
    catHeader.title = `${cat.title} — ${cat.description}`;

    const chevron = document.createElement('span');
    chevron.className = `chevron ${isCatExpanded ? 'expanded' : ''}`;
    chevron.textContent = '▶';

    const icon = document.createElement('span');
    icon.className = 'docs-category-icon';
    icon.textContent = cat.icon;

    const titleWrap = document.createElement('div');
    titleWrap.className = 'docs-category-title-wrap';

    const titleEl = document.createElement('span');
    titleEl.className = 'docs-category-title';
    titleEl.textContent = cat.title;
    titleWrap.appendChild(titleEl);

    // Category-specific search toggle button
    const isCatSearchOpen = state.openCategorySearch.includes(cat.id) || catLocalQuery.length > 0;
    const catSearchBtn = document.createElement('button');
    catSearchBtn.type = 'button';
    catSearchBtn.id = `doc-cat-search-btn-${cat.id}`;
    catSearchBtn.className = `icon-btn docs-cat-search-btn ${isCatSearchOpen ? 'active' : ''}`;
    catSearchBtn.title = `Search specifically in ${cat.title}`;
    catSearchBtn.setAttribute('aria-label', `Search specifically in ${cat.title}`);
    catSearchBtn.textContent = '🔎';
    catSearchBtn.onclick = (e) => {
      e.stopPropagation();
      toggleCategorySearchBar(cat.id);
    };

    const badge = document.createElement('span');
    badge.className = 'docs-category-badge';
    badge.textContent =
      globalQueryTrimmed.length > 0 || catLocalQuery.length > 0
        ? `${catResult.matchedTopicCount}/${catResult.totalTopicCount}`
        : String(catResult.totalTopicCount);

    catHeader.appendChild(chevron);
    catHeader.appendChild(icon);
    catHeader.appendChild(titleWrap);
    catHeader.appendChild(catSearchBtn);
    catHeader.appendChild(badge);

    catHeader.onclick = () => {
      toggleCategory(cat.id);
    };
    catHeader.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCategory(cat.id);
      }
    };

    catWrapper.appendChild(catHeader);

    // Category-specific inline search bar
    if (isCatSearchOpen) {
      const catSearchBar = document.createElement('div');
      catSearchBar.className = 'docs-cat-search-bar';

      const catInput = document.createElement('input');
      catInput.type = 'text';
      catInput.id = `doc-cat-search-input-${cat.id}`;
      catInput.className = 'docs-cat-search-input';
      catInput.placeholder = `Search in ${cat.title}...`;
      catInput.title = `Specific search within ${cat.title}`;
      catInput.setAttribute('aria-label', `Specific search within ${cat.title}`);
      catInput.value = state.categoryQueries[cat.id] ?? '';
      catInput.onclick = (e) => e.stopPropagation();
      catInput.oninput = () => {
        state.categoryQueries[cat.id] = catInput.value;
        saveState();
        const cursorPos = catInput.selectionStart ?? catInput.value.length;
        renderAccordion();
        const restored = document.getElementById(`doc-cat-search-input-${cat.id}`) as HTMLInputElement | null;
        if (restored) {
          restored.focus();
          restored.setSelectionRange(cursorPos, cursorPos);
        }
      };
      catInput.onkeydown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          state.categoryQueries[cat.id] = '';
          const idx = state.openCategorySearch.indexOf(cat.id);
          if (idx !== -1) state.openCategorySearch.splice(idx, 1);
          saveState();
          renderAccordion();
        }
      };

      const catClearBtn = document.createElement('button');
      catClearBtn.type = 'button';
      catClearBtn.id = `doc-cat-search-clear-${cat.id}`;
      catClearBtn.className = 'icon-btn docs-inline-clear';
      catClearBtn.title = `Close ${cat.title} search`;
      catClearBtn.setAttribute('aria-label', `Close ${cat.title} search`);
      catClearBtn.textContent = '✕';
      catClearBtn.onclick = (e) => {
        e.stopPropagation();
        delete state.categoryQueries[cat.id];
        const idx = state.openCategorySearch.indexOf(cat.id);
        if (idx !== -1) state.openCategorySearch.splice(idx, 1);
        saveState();
        renderAccordion();
      };

      catSearchBar.appendChild(catInput);
      catSearchBar.appendChild(catClearBtn);
      catWrapper.appendChild(catSearchBar);
    }

    // Category Body (Selectable Topic Tree Items)
    if (isCatExpanded) {
      const topicsContainer = document.createElement('div');
      topicsContainer.className = 'docs-topics-list';
      topicsContainer.setAttribute('role', 'group');

      if (catResult.topics.length === 0) {
        const noCatMatch = document.createElement('div');
        noCatMatch.className = 'docs-cat-empty';
        noCatMatch.textContent = `No topics match "${catLocalQuery}" in ${cat.title}.`;
        topicsContainer.appendChild(noCatMatch);
      } else {
        for (const topicResult of catResult.topics) {
          topicsContainer.appendChild(renderTopicTreeNode(topicResult));
        }
      }

      catWrapper.appendChild(topicsContainer);
    }

    accordionRoot.appendChild(catWrapper);
  }
}

function renderTopicTreeNode(topicResult: FilteredDocTopicResult): HTMLElement {
  const { topic, matchCount, effectiveHighlightTerms } = topicResult;
  const isSelected = state.selectedTopicId === topic.id;

  const topicNode = document.createElement('div');
  topicNode.className = `docs-topic-item ${isSelected ? 'selected' : ''}`;
  topicNode.id = `doc-topic-${topic.id}`;
  topicNode.tabIndex = 0;
  topicNode.setAttribute('role', 'treeitem');
  topicNode.setAttribute('aria-level', '2');
  topicNode.setAttribute('aria-selected', String(isSelected));
  topicNode.title = `${topic.title} — ${topic.summary}`;

  const icon = document.createElement('span');
  icon.className = 'docs-topic-icon';
  icon.textContent = topic.icon;

  const titleEl = document.createElement('span');
  titleEl.className = 'docs-topic-title';
  titleEl.innerHTML = highlightText(topic.title, effectiveHighlightTerms);

  topicNode.appendChild(icon);
  topicNode.appendChild(titleEl);

  if (matchCount > 0) {
    const hitBadge = document.createElement('span');
    hitBadge.className = 'docs-hit-badge';
    hitBadge.title = `${matchCount} match(es) in this topic`;
    hitBadge.textContent = `${matchCount}`;
    topicNode.appendChild(hitBadge);
  }

  topicNode.onclick = (e) => {
    e.stopPropagation();
    selectAndOpenTopic(topic.id, effectiveHighlightTerms);
  };
  topicNode.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      selectAndOpenTopic(topic.id, effectiveHighlightTerms);
    }
  };

  return topicNode;
}

function selectAndOpenTopic(topicId: string, highlightTerms: string[]): void {
  state.selectedTopicId = topicId;
  saveState();
  renderAccordion();
  postMessageToHost<DocsToHost>({
    type: 'openTopic',
    topicId,
    highlightTerms,
  });
}

function toggleCategory(catId: DocCategoryId): void {
  const idx = state.expandedCategories.indexOf(catId);
  if (idx !== -1) {
    state.expandedCategories.splice(idx, 1);
  } else {
    state.expandedCategories.push(catId);
  }
  saveState();
  renderAccordion();
}

function toggleCategorySearchBar(catId: DocCategoryId): void {
  const idx = state.openCategorySearch.indexOf(catId);
  if (idx !== -1) {
    state.openCategorySearch.splice(idx, 1);
    delete state.categoryQueries[catId];
  } else {
    state.openCategorySearch.push(catId);
    if (!state.expandedCategories.includes(catId)) {
      state.expandedCategories.push(catId);
    }
  }
  saveState();
  renderAccordion();

  if (state.openCategorySearch.includes(catId)) {
    const input = document.getElementById(`doc-cat-search-input-${catId}`) as HTMLInputElement | null;
    input?.focus();
  }
}

function expandAll(): void {
  state.expandedCategories = AXAR_DOCS_CATALOG.map((c) => c.id);
  saveState();
  renderAccordion();
}

function collapseAll(): void {
  state.expandedCategories = [];
  saveState();
  renderAccordion();
}

function resetAllFilters(): void {
  state.globalQuery = '';
  state.selectedCategory = 'all';
  state.fieldScope = 'all';
  state.categoryQueries = {};
  state.openCategorySearch = [];
  saveState();
  syncToolbarControls();
  renderAccordion();
}

// Event Listeners
globalSearchInput.addEventListener('input', () => {
  state.globalQuery = globalSearchInput.value;
  clearSearchBtn.hidden = state.globalQuery.length === 0;
  saveState();
  renderAccordion();
});

globalSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.globalQuery = '';
    globalSearchInput.value = '';
    clearSearchBtn.hidden = true;
    saveState();
    renderAccordion();
  }
});

clearSearchBtn.addEventListener('click', () => {
  state.globalQuery = '';
  globalSearchInput.value = '';
  clearSearchBtn.hidden = true;
  saveState();
  renderAccordion();
  globalSearchInput.focus();
});

toggleAdvancedBtn.addEventListener('click', () => {
  state.scopedBarOpen = !state.scopedBarOpen;
  saveState();
  syncToolbarControls();
});

categorySelect.addEventListener('change', () => {
  state.selectedCategory = categorySelect.value as DocCategoryId | 'all';
  saveState();
  syncToolbarControls();
  renderAccordion();
});

for (const btn of scopeButtons) {
  btn.addEventListener('click', () => {
    const scope = (btn.getAttribute('data-scope') as DocSearchFieldScope) || 'all';
    state.fieldScope = scope;
    saveState();
    syncToolbarControls();
    renderAccordion();
  });
}

resetFiltersBtn.addEventListener('click', () => {
  resetAllFilters();
});

onHostMessage<HostToDocs>((msg) => {
  switch (msg.type) {
    case 'focusSearch':
      globalSearchInput.focus();
      globalSearchInput.select();
      break;
    case 'expandAll':
      expandAll();
      break;
    case 'collapseAll':
      collapseAll();
      break;
    case 'selectTopic':
      state.selectedTopicId = msg.topicId;
      for (const cat of AXAR_DOCS_CATALOG) {
        if (cat.topics.some((t) => t.id === msg.topicId)) {
          if (!state.expandedCategories.includes(cat.id)) {
            state.expandedCategories.push(cat.id);
          }
        }
      }
      saveState();
      renderAccordion();
      break;
  }
});

// Boot
syncToolbarControls();
renderAccordion();
postMessageToHost<DocsToHost>({ type: 'ready' });
