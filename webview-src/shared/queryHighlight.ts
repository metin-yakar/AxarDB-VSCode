import { escapeHtml } from './jsonHighlight.js';

export function highlightAxarQuery(script: string): string {
  if (!script) return '';

  // Token regex matching:
  // 1. Strings: "..." or '...' or `...`
  // 2. Parameters / Vaults: @param or $vault
  // 3. Dot accessors: .method or .property
  // 4. Numbers
  // 5. Operators / Arrow: =>, ===, !==, ==, !=, >=, <=, &&, ||, >, <, etc.
  // 6. Keywords
  // 7. Identifiers (db, memory, bulk, x, etc.)
  const tokenRegex =
    /("(?:\\[\s\S]|[^\\"])*"|'(?:\\[\s\S]|[^\\'])*'|`[^`]*`)|(@[a-zA-Z0-9_]+|\$[a-zA-Z0-9_]+)|(\.[a-zA-Z_][a-zA-Z0-9_]*)|(\b\d+(?:\.\d+)?\b)|(=>|===|!==|==|!=|<=|>=|&&|\|\||[>!<+\-*\/=])|\b(true|false|null|undefined|return|const|let|var)\b|([a-zA-Z_][a-zA-Z0-9_]*)/g;

  const axarMethods = new Set([
    'findall',
    'find',
    'insert',
    'update',
    'delete',
    'count',
    'skip',
    'take',
    'orderBy',
    'orderByDesc',
    'select',
    'distinct',
    'toList',
    'showCollections',
    'listViews',
    'getView',
    'getTrigger',
    'getCollection',
  ]);

  const axarRoots = new Set(['db', 'memory', 'bulk']);

  const highlighted = script.replace(
    tokenRegex,
    (match, strVal, paramVal, dotPropVal, numVal, opVal, kwVal, identVal) => {
      // 1. Strings
      if (strVal) {
        return `<span class="ax-str">${escapeHtml(strVal)}</span>`;
      }

      // 2. Query injection tags (@id, $vault)
      if (paramVal) {
        return `<span class="ax-param-tag">${escapeHtml(paramVal)}</span>`;
      }

      // 3. Dot property / method (.findall, .email)
      if (dotPropVal) {
        const propName = dotPropVal.slice(1);
        if (axarMethods.has(propName)) {
          return `.<span class="ax-method">${escapeHtml(propName)}</span>`;
        }
        return `.<span class="ax-field">${escapeHtml(propName)}</span>`;
      }

      // 4. Numbers
      if (numVal) {
        return `<span class="ax-num">${escapeHtml(numVal)}</span>`;
      }

      // 5. Operators & Arrow
      if (opVal) {
        return `<span class="ax-op">${escapeHtml(opVal)}</span>`;
      }

      // 6. Keywords
      if (kwVal) {
        return `<span class="ax-kw">${escapeHtml(kwVal)}</span>`;
      }

      // 7. Identifiers
      if (identVal) {
        if (axarRoots.has(identVal)) {
          return `<span class="ax-root">${escapeHtml(identVal)}</span>`;
        }
        if (identVal === 'x' || identVal === 'doc' || identVal === 'item') {
          return `<span class="ax-param">${escapeHtml(identVal)}</span>`;
        }
        return `<span class="ax-ident">${escapeHtml(identVal)}</span>`;
      }

      return escapeHtml(match);
    }
  );

  return highlighted;
}
