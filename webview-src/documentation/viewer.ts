import {
  postMessageToHost,
  onHostMessage,
  getWebviewState,
  setWebviewState,
} from '../shared/vscodeApi.js';
import { escapeHtml } from '../shared/jsonHighlight.js';
import { highlightAxarQuery } from '../shared/queryHighlight.js';
import { DocsToHost, HostToDocs } from '../../src/contracts/messages.js';
import { DocCategory, DocTopic } from '../../src/contracts/types.js';
import {
  AXAR_DOCS_CATALOG,
  countSubstringOccurrences,
  getTopicSearchableText,
} from '../../src/docs/axarDocsCatalog.js';

interface ViewerState {
  topicId: string;
  sidebarHighlightTerms: string[];
  localQuery: string;
}

const DEFAULT_VIEWER_STATE: ViewerState = {
  topicId: 'overview',
  sidebarHighlightTerms: [],
  localQuery: '',
};

let state: ViewerState = {
  ...DEFAULT_VIEWER_STATE,
  ...getWebviewState<ViewerState>(DEFAULT_VIEWER_STATE),
};

const breadcrumbEl = document.getElementById('doc-viewer-breadcrumb') as HTMLDivElement;
const searchInput = document.getElementById('doc-viewer-search-input') as HTMLInputElement;
const matchCountEl = document.getElementById('doc-viewer-match-count') as HTMLSpanElement;
const clearBtn = document.getElementById('doc-viewer-search-clear') as HTMLButtonElement;
const contentEl = document.getElementById('doc-viewer-content') as HTMLElement;
const footerEl = document.getElementById('doc-viewer-footer') as HTMLElement;

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

function getEffectiveTerms(): string[] {
  const terms: string[] = [];
  for (const t of state.sidebarHighlightTerms) {
    const clean = t.trim();
    if (clean && !terms.includes(clean)) terms.push(clean);
  }
  const local = state.localQuery.trim();
  if (local && !terms.includes(local)) {
    terms.push(local);
  }
  return terms;
}

function highlightText(text: string, terms: string[]): string {
  if (terms.length === 0) {
    return escapeHtml(text);
  }
  const escapedText = escapeHtml(text);
  const pattern = terms.map(buildTurkishInsensitivePattern).join('|');
  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    return escapedText.replace(regex, '<mark class="highlight-match">$1</mark>');
  } catch {
    return escapedText;
  }
}

/**
 * Highlights code with syntax tokens AND overlays `<mark class="highlight-match">` on text nodes
 * if search terms are active, so syntax coloring is always preserved!
 */
function renderHighlightedCode(code: string, terms: string[]): string {
  const syntaxHtml = highlightAxarQuery(code);
  if (terms.length === 0) {
    return syntaxHtml;
  }
  const pattern = terms.map(buildTurkishInsensitivePattern).join('|');
  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    // Only replace outside of HTML tags
    return syntaxHtml.replace(/(<[^>]+>)|([^<]+)/g, (_m, tag: string | undefined, textNode: string | undefined) => {
      if (tag) return tag;
      if (!textNode) return '';
      return textNode.replace(regex, '<mark class="highlight-match">$1</mark>');
    });
  } catch {
    return syntaxHtml;
  }
}

function findTopicAndCategory(topicId: string): {
  category: DocCategory;
  topic: DocTopic;
  prevTopic: DocTopic | null;
  nextTopic: DocTopic | null;
} {
  const flatList: Array<{ category: DocCategory; topic: DocTopic }> = [];
  for (const cat of AXAR_DOCS_CATALOG) {
    for (const t of cat.topics) {
      flatList.push({ category: cat, topic: t });
    }
  }

  let idx = flatList.findIndex((item) => item.topic.id === topicId);
  if (idx === -1) idx = 0;

  const current = flatList[idx]!;
  const prev = idx > 0 ? flatList[idx - 1]!.topic : null;
  const next = idx < flatList.length - 1 ? flatList[idx + 1]!.topic : null;

  return {
    category: current.category,
    topic: current.topic,
    prevTopic: prev,
    nextTopic: next,
  };
}

function renderDocument(): void {
  const { category, topic, prevTopic, nextTopic } = findTopicAndCategory(state.topicId);
  const terms = getEffectiveTerms();

  // Update local search badge
  const localTrim = state.localQuery.trim();
  clearBtn.hidden = localTrim.length === 0;
  if (localTrim.length > 0) {
    const fullText = getTopicSearchableText(topic, 'all');
    const hits = countSubstringOccurrences(fullText, localTrim);
    matchCountEl.hidden = false;
    matchCountEl.textContent = `${hits} match(es)`;
  } else {
    matchCountEl.hidden = true;
    matchCountEl.textContent = '';
  }

  // Breadcrumb
  breadcrumbEl.innerHTML = '';
  const catBadge = document.createElement('span');
  catBadge.className = 'doc-viewer-cat-badge';
  catBadge.textContent = `${category.icon} ${category.title}`;

  const sep = document.createElement('span');
  sep.className = 'doc-viewer-breadcrumb-sep';
  sep.textContent = '›';

  const topicCrumb = document.createElement('span');
  topicCrumb.className = 'doc-viewer-topic-crumb';
  topicCrumb.textContent = `${topic.icon} ${topic.title}`;

  breadcrumbEl.appendChild(catBadge);
  breadcrumbEl.appendChild(sep);
  breadcrumbEl.appendChild(topicCrumb);

  // Content
  contentEl.innerHTML = '';

  const article = document.createElement('article');
  article.className = 'doc-viewer-article';
  article.id = `doc-article-${topic.id}`;

  // Title Header
  const h1 = document.createElement('h1');
  h1.className = 'doc-viewer-title';
  h1.innerHTML = `${escapeHtml(topic.icon)} ${highlightText(topic.title, terms)}`;
  article.appendChild(h1);

  // Summary Lead
  const lead = document.createElement('p');
  lead.className = 'doc-viewer-lead';
  lead.innerHTML = highlightText(topic.summary, terms);
  article.appendChild(lead);

  // Keyword tags
  if (topic.keywords.length > 0) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'doc-viewer-tags';
    for (const kw of topic.keywords) {
      const tag = document.createElement('span');
      tag.className = 'doc-viewer-tag';
      tag.innerHTML = highlightText(kw, terms);
      tagsRow.appendChild(tag);
    }
    article.appendChild(tagsRow);
  }

  // Paragraphs
  if (topic.paragraphs && topic.paragraphs.length > 0) {
    for (const pText of topic.paragraphs) {
      const p = document.createElement('p');
      p.className = 'doc-viewer-paragraph';
      p.innerHTML = highlightText(pText, terms);
      article.appendChild(p);
    }
  }

  // Bullets
  if (topic.bullets && topic.bullets.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'doc-viewer-bullets';
    for (const bText of topic.bullets) {
      const li = document.createElement('li');
      li.innerHTML = highlightText(bText, terms);
      ul.appendChild(li);
    }
    article.appendChild(ul);
  }

  // Callouts
  if (topic.callouts && topic.callouts.length > 0) {
    for (const callout of topic.callouts) {
      const box = document.createElement('div');
      box.className = `doc-viewer-callout doc-viewer-callout-${callout.kind}`;
      const strong = document.createElement('strong');
      strong.innerHTML = highlightText(`${callout.title}: `, terms);
      const span = document.createElement('span');
      span.innerHTML = highlightText(callout.text, terms);
      box.appendChild(strong);
      box.appendChild(span);
      article.appendChild(box);
    }
  }

  // Tables
  if (topic.tables && topic.tables.length > 0) {
    for (const tbl of topic.tables) {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'doc-viewer-table-wrap';
      const table = document.createElement('table');
      table.className = 'doc-viewer-table';

      const thead = document.createElement('thead');
      const trHead = document.createElement('tr');
      for (const h of tbl.headers) {
        const th = document.createElement('th');
        th.innerHTML = highlightText(h, terms);
        trHead.appendChild(th);
      }
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const row of tbl.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.innerHTML = highlightText(cell, terms);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      article.appendChild(tableWrap);
    }
  }

  // Highlighted & Copyable Code Frames
  if (topic.codeExamples && topic.codeExamples.length > 0) {
    const codeSectionTitle = document.createElement('h2');
    codeSectionTitle.className = 'doc-viewer-section-heading';
    codeSectionTitle.textContent = 'Code Examples';
    article.appendChild(codeSectionTitle);

    topic.codeExamples.forEach((example, idx) => {
      const frame = document.createElement('div');
      frame.className = 'doc-code-frame';
      frame.id = `doc-code-frame-${topic.id}-${idx}`;

      const frameHeader = document.createElement('div');
      frameHeader.className = 'doc-code-frame-header';

      const leftInfo = document.createElement('div');
      leftInfo.className = 'doc-code-frame-info';

      const langBadge = document.createElement('span');
      langBadge.className = 'doc-code-lang-badge';
      langBadge.textContent = example.language.toUpperCase();

      const codeTitle = document.createElement('span');
      codeTitle.className = 'doc-code-frame-title';
      codeTitle.innerHTML = highlightText(example.title || 'Example', terms);

      leftInfo.appendChild(langBadge);
      leftInfo.appendChild(codeTitle);

      const actions = document.createElement('div');
      actions.className = 'doc-code-frame-actions';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.id = `doc-copy-${topic.id}-${idx}`;
      copyBtn.className = 'btn secondary doc-code-copy-btn';
      copyBtn.title = 'Copy code example to clipboard';
      copyBtn.setAttribute('aria-label', 'Copy code example to clipboard');
      copyBtn.textContent = '📋 Copy Code';
      copyBtn.onclick = () => {
        postMessageToHost<DocsToHost>({ type: 'copyCode', code: example.code });
        copyBtn.textContent = '✓ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Code';
          copyBtn.classList.remove('copied');
        }, 1400);
      };
      actions.appendChild(copyBtn);

      if (example.runnable || example.language === 'javascript') {
        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.id = `doc-play-${topic.id}-${idx}`;
        playBtn.className = 'btn doc-code-play-btn';
        playBtn.title = 'Open code example in AxarDB Playground';
        playBtn.setAttribute('aria-label', 'Open code example in AxarDB Playground');
        playBtn.textContent = '▶ Open in Playground';
        playBtn.onclick = () => {
          postMessageToHost<DocsToHost>({ type: 'openInPlayground', code: example.code });
        };
        actions.appendChild(playBtn);
      }

      frameHeader.appendChild(leftInfo);
      frameHeader.appendChild(actions);
      frame.appendChild(frameHeader);

      const pre = document.createElement('pre');
      pre.className = 'doc-code-frame-pre';
      const codeEl = document.createElement('code');
      codeEl.className = `language-${example.language}`;
      codeEl.innerHTML = renderHighlightedCode(example.code, terms);
      pre.appendChild(codeEl);
      frame.appendChild(pre);

      article.appendChild(frame);
    });
  }

  contentEl.appendChild(article);

  // Footer Prev / Next Navigation
  footerEl.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.id = 'doc-viewer-prev-btn';
  prevBtn.className = 'btn secondary doc-nav-btn';
  if (prevTopic) {
    prevBtn.title = `Previous: ${prevTopic.title}`;
    prevBtn.setAttribute('aria-label', `Previous topic: ${prevTopic.title}`);
    prevBtn.textContent = `← ${prevTopic.icon} ${prevTopic.title}`;
    prevBtn.onclick = () => navigateToTopic(prevTopic.id);
  } else {
    prevBtn.disabled = true;
    prevBtn.title = 'No previous topic';
    prevBtn.setAttribute('aria-label', 'No previous topic');
    prevBtn.textContent = '← Start';
  }

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'doc-viewer-next-btn';
  nextBtn.className = 'btn secondary doc-nav-btn';
  if (nextTopic) {
    nextBtn.title = `Next: ${nextTopic.title}`;
    nextBtn.setAttribute('aria-label', `Next topic: ${nextTopic.title}`);
    nextBtn.textContent = `${nextTopic.icon} ${nextTopic.title} →`;
    nextBtn.onclick = () => navigateToTopic(nextTopic.id);
  } else {
    nextBtn.disabled = true;
    nextBtn.title = 'No next topic';
    nextBtn.setAttribute('aria-label', 'No next topic');
    nextBtn.textContent = 'End →';
  }

  footerEl.appendChild(prevBtn);
  footerEl.appendChild(nextBtn);
}

function navigateToTopic(topicId: string): void {
  state.topicId = topicId;
  saveState();
  renderDocument();
  contentEl.scrollTop = 0;
  postMessageToHost<DocsToHost>({ type: 'openTopic', topicId });
}

searchInput.addEventListener('input', () => {
  state.localQuery = searchInput.value;
  saveState();
  renderDocument();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    state.localQuery = '';
    searchInput.value = '';
    saveState();
    renderDocument();
  }
});

clearBtn.addEventListener('click', () => {
  state.localQuery = '';
  searchInput.value = '';
  saveState();
  renderDocument();
  searchInput.focus();
});

onHostMessage<HostToDocs>((msg) => {
  if (msg.type === 'selectTopic') {
    state.topicId = msg.topicId;
    state.sidebarHighlightTerms = msg.highlightTerms ?? [];
    saveState();
    renderDocument();
    contentEl.scrollTop = 0;
  } else if (msg.type === 'focusSearch') {
    searchInput.focus();
    searchInput.select();
  }
});

// Boot
searchInput.value = state.localQuery;
renderDocument();
postMessageToHost<DocsToHost>({ type: 'ready' });

