import { store } from './store.js';
import { Doc } from '../../src/contracts/types.js';

export interface SuggestionItem {
  label: string;
  insertText: string;
  kind: 'collection' | 'field' | 'method' | 'keyword' | 'operator';
  detail: string;
  icon: string;
  cursorOffset?: number; // Offset from end of insertText
}

export function extractColumnsFromDocs(docs: Doc[]): { name: string; type: string }[] {
  const map = new Map<string, string>();
  for (const doc of docs) {
    if (doc && typeof doc === 'object') {
      for (const [key, val] of Object.entries(doc)) {
        if (!map.has(key)) {
          const t = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
          map.set(key, t);
        }
      }
    }
  }
  return Array.from(map.entries()).map(([name, type]) => ({ name, type }));
}

export function getAxarSuggestions(
  textBeforeCursor: string,
  isFilterOnly = false
): { suggestions: SuggestionItem[]; replaceLength: number } {
  const state = store.getState();
  const knownCols = new Set<string>();
  if (state.collection) knownCols.add(state.collection);
  if (state.knownCollections) {
    state.knownCollections.forEach((c) => knownCols.add(c));
  }
  knownCols.add('syslogs');
  knownCols.add('sysvaults');

  const columns = extractColumnsFromDocs(state.docs);
  if (columns.length === 0 && state.selectedDoc) {
    Object.keys(state.selectedDoc).forEach((k) => {
      columns.push({ name: k, type: typeof (state.selectedDoc as Record<string, unknown>)[k] });
    });
  }

  // 1. After dot accessor on variable: x. or item. or doc. (or x.em)
  const varDotMatch = textBeforeCursor.match(/(?:x|doc|item)\.([a-zA-Z0-9_]*)$/i);
  if (varDotMatch) {
    const prefix = varDotMatch[1]!.toLowerCase();
    const suggestions: SuggestionItem[] = columns
      .filter((col) => col.name.toLowerCase().startsWith(prefix))
      .map((col) => ({
        label: col.name,
        insertText: col.name,
        kind: 'field',
        detail: `column (${col.type})`,
        icon: '🏷️',
      }));
    return { suggestions, replaceLength: varDotMatch[1]!.length };
  }

  // 2. Chaining after closing parenthesis: ). or ).sk
  const chainMatch = textBeforeCursor.match(/\)\.([a-zA-Z0-9_]*)$/);
  if (chainMatch) {
    const prefix = chainMatch[1]!.toLowerCase();
    const chainMethods: SuggestionItem[] = [
      { label: 'skip(0)', insertText: 'skip(0)', kind: 'method', detail: 'Skip N documents', icon: '⚡', cursorOffset: -1 },
      { label: 'take(50)', insertText: 'take(50)', kind: 'method', detail: 'Limit to N documents', icon: '⚡', cursorOffset: -1 },
      { label: 'orderBy(x => x.)', insertText: 'orderBy(x => x.)', kind: 'method', detail: 'Sort ascending', icon: '⚡', cursorOffset: -1 },
      { label: 'orderByDesc(x => x.)', insertText: 'orderByDesc(x => x.)', kind: 'method', detail: 'Sort descending', icon: '⚡', cursorOffset: -1 },
      { label: 'select(x => x.)', insertText: 'select(x => x.)', kind: 'method', detail: 'Project fields', icon: '⚡', cursorOffset: -1 },
      { label: 'distinct()', insertText: 'distinct()', kind: 'method', detail: 'Distinct records', icon: '⚡' },
      { label: 'toList()', insertText: 'toList()', kind: 'method', detail: 'Materialize to array', icon: '⚡' },
      { label: 'count()', insertText: 'count()', kind: 'method', detail: 'Count records', icon: '⚡' },
    ];
    return {
      suggestions: chainMethods.filter((m) => m.label.toLowerCase().startsWith(prefix)),
      replaceLength: chainMatch[1]!.length,
    };
  }

  // 3. Collection methods: db.<col>. or db.<col>.find
  const colMethodMatch = textBeforeCursor.match(/(?:db|memory|bulk)\.[a-zA-Z0-9_]+\.([a-zA-Z0-9_]*)$/i);
  if (colMethodMatch) {
    const prefix = colMethodMatch[1]!.toLowerCase();
    const methods: SuggestionItem[] = [
      { label: 'findall(x => )', insertText: 'findall(x => )', kind: 'method', detail: 'Find all matching documents', icon: '⚡', cursorOffset: -1 },
      { label: 'find(x => )', insertText: 'find(x => )', kind: 'method', detail: 'Find first matching document', icon: '⚡', cursorOffset: -1 },
      { label: 'count()', insertText: 'count()', kind: 'method', detail: 'Count matching documents', icon: '⚡' },
      { label: 'insert({})', insertText: 'insert({})', kind: 'method', detail: 'Insert document', icon: '⚡', cursorOffset: -2 },
      { label: 'update(x => , {})', insertText: 'update(x => , {})', kind: 'method', detail: 'Update documents', icon: '⚡', cursorOffset: -6 },
      { label: 'delete(x => )', insertText: 'delete(x => )', kind: 'method', detail: 'Delete documents', icon: '⚡', cursorOffset: -1 },
    ];
    return {
      suggestions: methods.filter((m) => m.label.toLowerCase().startsWith(prefix)),
      replaceLength: colMethodMatch[1]!.length,
    };
  }

  // 4. Collections after db. or memory. or bulk.
  const dbMatch = textBeforeCursor.match(/(db|memory|bulk)\.([a-zA-Z0-9_]*)$/i);
  if (dbMatch) {
    const prefix = dbMatch[2]!.toLowerCase();
    const suggestions: SuggestionItem[] = Array.from(knownCols)
      .filter((col) => col.toLowerCase().startsWith(prefix))
      .map((col) => ({
        label: col,
        insertText: col,
        kind: 'collection',
        detail: 'AxarDB Collection',
        icon: '📦',
      }));
    return { suggestions, replaceLength: dbMatch[2]!.length };
  }

  // 5. In Filter input or inside arrow function predicate
  if (isFilterOnly || textBeforeCursor.includes('=>')) {
    // If typing after column name: suggest comparison operators
    const afterColMatch = textBeforeCursor.match(/x\.[a-zA-Z0-9_]+\s*([=><!&|]*)$/);
    if (afterColMatch && afterColMatch[1] !== undefined) {
      const opPrefix = afterColMatch[1];
      const operators: SuggestionItem[] = [
        { label: '== ', insertText: '== ', kind: 'operator', detail: 'Equals', icon: '🔧' },
        { label: '!= ', insertText: '!= ', kind: 'operator', detail: 'Not equals', icon: '🔧' },
        { label: '> ', insertText: '> ', kind: 'operator', detail: 'Greater than', icon: '🔧' },
        { label: '>= ', insertText: '>= ', kind: 'operator', detail: 'Greater or equal', icon: '🔧' },
        { label: '< ', insertText: '< ', kind: 'operator', detail: 'Less than', icon: '🔧' },
        { label: '<= ', insertText: '<= ', kind: 'operator', detail: 'Less or equal', icon: '🔧' },
        { label: '&& ', insertText: '&& ', kind: 'operator', detail: 'Logical AND', icon: '🔧' },
        { label: '|| ', insertText: '|| ', kind: 'operator', detail: 'Logical OR', icon: '🔧' },
      ];
      const matched = operators.filter((o) => o.label.startsWith(opPrefix));
      if (matched.length > 0) {
        return { suggestions: matched, replaceLength: opPrefix.length };
      }
    }

    // If starting filter, suggest arrow starter
    const starterMatch = textBeforeCursor.match(/^\s*([x=]*)$/);
    if (starterMatch) {
      return {
        suggestions: [
          { label: 'x => x.', insertText: 'x => x.', kind: 'keyword', detail: 'Arrow predicate function', icon: '⚡' },
        ],
        replaceLength: starterMatch[1]!.length,
      };
    }
  }

  // 6. Starting with db namespace at root
  const rootMatch = textBeforeCursor.match(/(?:^|\s)(d|db|m|mem|memory|b|bulk)$/i);
  if (rootMatch) {
    const prefix = rootMatch[1]!.toLowerCase();
    const roots: SuggestionItem[] = [
      { label: 'db.', insertText: 'db.', kind: 'keyword', detail: 'Database operations', icon: '📦' },
      { label: 'memory.', insertText: 'memory.', kind: 'keyword', detail: 'In-memory collections', icon: '📦' },
      { label: 'bulk.', insertText: 'bulk.', kind: 'keyword', detail: 'Bulk collections', icon: '📦' },
    ];
    return {
      suggestions: roots.filter((r) => r.label.toLowerCase().startsWith(prefix)),
      replaceLength: prefix.length,
    };
  }

  return { suggestions: [], replaceLength: 0 };
}

export class AutocompleteController {
  private inputEl: HTMLInputElement | HTMLTextAreaElement;
  private containerEl: HTMLElement;
  private widgetEl: HTMLElement | null = null;
  private isFilterOnly: boolean;
  private activeSuggestions: SuggestionItem[] = [];
  private selectedIndex = 0;
  private replaceLength = 0;
  private onSelectCallback?: () => void;

  constructor(
    inputEl: HTMLInputElement | HTMLTextAreaElement,
    containerEl: HTMLElement,
    options: { isFilterOnly?: boolean; onSelect?: () => void } = {}
  ) {
    this.inputEl = inputEl;
    this.containerEl = containerEl;
    this.isFilterOnly = options.isFilterOnly ?? false;
    this.onSelectCallback = options.onSelect;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.inputEl.addEventListener('input', () => this.handleInput());
    this.inputEl.addEventListener('keydown', (e: Event) => this.handleKeyDown(e as KeyboardEvent));
    this.inputEl.addEventListener('blur', () => {
      setTimeout(() => this.hide(), 160);
    });
  }

  public handleInput(): void {
    const caret = this.inputEl.selectionStart ?? this.inputEl.value.length;
    const textBefore = this.inputEl.value.slice(0, caret);

    const { suggestions, replaceLength } = getAxarSuggestions(textBefore, this.isFilterOnly);
    this.activeSuggestions = suggestions;
    this.replaceLength = replaceLength;
    this.selectedIndex = 0;

    if (suggestions.length > 0) {
      this.show();
    } else {
      this.hide();
    }
  }

  private handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.widgetEl || this.activeSuggestions.length === 0) {
      return false;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.activeSuggestions.length;
      this.renderList();
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.activeSuggestions.length) % this.activeSuggestions.length;
      this.renderList();
      return true;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      const selected = this.activeSuggestions[this.selectedIndex];
      if (selected) {
        e.preventDefault();
        this.applySuggestion(selected);
        return true;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      return true;
    }

    return false;
  }

  public applySuggestion(item: SuggestionItem): void {
    const caret = this.inputEl.selectionStart ?? this.inputEl.value.length;
    const before = this.inputEl.value.slice(0, caret - this.replaceLength);
    const after = this.inputEl.value.slice(caret);

    this.inputEl.value = before + item.insertText + after;
    const newCaret = before.length + item.insertText.length + (item.cursorOffset ?? 0);

    this.inputEl.setSelectionRange(newCaret, newCaret);
    this.hide();

    // Trigger input event so syntax highlighting updates
    this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));

    if (this.onSelectCallback) {
      this.onSelectCallback();
    }
  }

  private show(): void {
    if (!this.widgetEl) {
      this.widgetEl = document.createElement('div');
      this.widgetEl.className = 'ax-suggest-widget';
      this.containerEl.appendChild(this.widgetEl);
    }

    // Position widget relative to input element
    const rect = this.inputEl.getBoundingClientRect();
    const containerRect = this.containerEl.getBoundingClientRect();

    this.widgetEl.style.top = `${rect.bottom - containerRect.top + 2}px`;
    this.widgetEl.style.left = `${rect.left - containerRect.left}px`;
    this.widgetEl.style.display = 'block';

    this.renderList();
  }

  public hide(): void {
    if (this.widgetEl) {
      this.widgetEl.style.display = 'none';
    }
    this.activeSuggestions = [];
  }

  private renderList(): void {
    if (!this.widgetEl) return;
    this.widgetEl.innerHTML = '';

    this.activeSuggestions.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `ax-suggest-item ${index === this.selectedIndex ? 'selected' : ''}`;

      const left = document.createElement('div');
      left.className = 'ax-suggest-left';

      const icon = document.createElement('span');
      icon.className = 'ax-suggest-icon';
      icon.textContent = item.icon;
      left.appendChild(icon);

      const label = document.createElement('span');
      label.className = 'ax-suggest-label';
      label.textContent = item.label;
      left.appendChild(label);

      row.appendChild(left);

      const detail = document.createElement('span');
      detail.className = 'ax-suggest-detail';
      detail.textContent = item.detail;
      row.appendChild(detail);

      row.onmousedown = (e) => {
        e.preventDefault();
        this.applySuggestion(item);
      };

      row.onmouseenter = () => {
        this.selectedIndex = index;
        this.renderList();
      };

      this.widgetEl!.appendChild(row);
    });

    const selectedRow = this.widgetEl.children[this.selectedIndex] as HTMLElement | undefined;
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
  }

  public destroy(): void {
    if (this.widgetEl) {
      this.widgetEl.remove();
      this.widgetEl = null;
    }
  }
}
