import { escapeHtml } from './jsonHighlight.js';

export function highlightAxarQuery(script: string): string {
  if (!script) return '';

  // Token regex matching:
  // 1. Comments: // ... or # ...
  // 2. Strings: "..." or '...' or `...`
  // 3. Parameters / Vaults: @param or $vault
  // 4. Dot accessors: .method or .property
  // 5. Numbers
  // 6. Operators / Arrow: =>, ===, !==, ==, !=, >=, <=, &&, ||, >, <, etc.
  // 7. Keywords
  // 8. Identifiers (db, memory, bulk, x, etc.)
  const tokenRegex =
    /(\/\/[^\r\n]*|#[^\r\n]*)|("(?:\\[\s\S]|[^\\"])*"|'(?:\\[\s\S]|[^\\'])*'|`[^`]*`)|(@[a-zA-Z0-9_]+|\$[a-zA-Z0-9_]+)|(\.[a-zA-Z_][a-zA-Z0-9_]*)|(\b\d+(?:\.\d+)?\b)|(=>|===|!==|==|!=|<=|>=|&&|\|\||[>!<+\-*\/=])|\b(true|false|null|undefined|return|const|let|var|if|else|for|of|using|await|new|from|import)\b|([a-zA-Z_][a-zA-Z0-9_]*)/g;

  const axarMethods = new Set([
    'findall',
    'find',
    'insert',
    'update',
    'delete',
    'deleteCollection',
    'count',
    'skip',
    'take',
    'orderBy',
    'orderByDesc',
    'select',
    'distinct',
    'first',
    'max',
    'min',
    'foreach',
    'contains',
    'startsWith',
    'toLowerCase',
    'includes',
    'toList',
    'ToList',
    'index',
    'join',
    'where',
    'reload',
    'view',
    'saveView',
    'getView',
    'deleteView',
    'saveTrigger',
    'getTrigger',
    'deleteTrigger',
    'showCollections',
    'listViews',
    'getCollection',
    'log',
    'InsertAsync',
    'QueryAsync',
    'UpdateAsync',
    'CountAsync',
    'FirstAsync',
    'CreateViewAsync',
    'CallViewAsync',
    'AddVaultAsync',
    'Collection',
    'Where',
    'collection',
    'to_list',
    'create_view',
    'call_view',
    'addSysMsg',
    'msg',
  ]);

  const axarGlobalFunctions = new Set([
    'alias',
    'guidv7',
    'guidv7CreatedAt',
    'guid',
    'getIndexes',
    'addVault',
    'webhook',
    'httpGet',
    'mysqlRead',
    'mysqlExec',
    'pgsqlRead',
    'pgsqlExec',
    'queue',
    'sha256',
    'md5',
    'encrypt',
    'decrypt',
    'toBase64',
    'fromBase64',
    'randomString',
    'randomNumber',
    'randomDecimal',
    'openai',
    'csv',
    'deepcopy',
    'toString',
    'split',
    'toDecimal',
    'toJson',
    'addMinutes',
    'addHours',
    'addDays',
    'AxarClient',
  ]);

  const axarRoots = new Set(['db', 'memory', 'bulk', 'console', 'event']);

  const highlighted = script.replace(
    tokenRegex,
    (match, commentVal, strVal, paramVal, dotPropVal, numVal, opVal, kwVal, identVal) => {
      // 1. Comments
      if (commentVal) {
        return `<span class="ax-comment">${escapeHtml(commentVal)}</span>`;
      }

      // 2. Strings
      if (strVal) {
        return `<span class="ax-str">${escapeHtml(strVal)}</span>`;
      }

      // 3. Query injection tags (@id, $vault)
      if (paramVal) {
        return `<span class="ax-param-tag">${escapeHtml(paramVal)}</span>`;
      }

      // 4. Dot property / method (.findall, .email)
      if (dotPropVal) {
        const propName = dotPropVal.slice(1);
        if (axarMethods.has(propName)) {
          return `.<span class="ax-method">${escapeHtml(propName)}</span>`;
        }
        return `.<span class="ax-field">${escapeHtml(propName)}</span>`;
      }

      // 5. Numbers
      if (numVal) {
        return `<span class="ax-num">${escapeHtml(numVal)}</span>`;
      }

      // 6. Operators & Arrow
      if (opVal) {
        return `<span class="ax-op">${escapeHtml(opVal)}</span>`;
      }

      // 7. Keywords
      if (kwVal) {
        return `<span class="ax-kw">${escapeHtml(kwVal)}</span>`;
      }

      // 8. Identifiers
      if (identVal) {
        if (axarRoots.has(identVal)) {
          return `<span class="ax-root">${escapeHtml(identVal)}</span>`;
        }
        if (axarGlobalFunctions.has(identVal)) {
          return `<span class="ax-method">${escapeHtml(identVal)}</span>`;
        }
        if (identVal === 'x' || identVal === 'u' || identVal === 'o' || identVal === 'p' || identVal === 'c' || identVal === 's' || identVal === 'l' || identVal === 'j' || identVal === 'doc' || identVal === 'item') {
          return `<span class="ax-param">${escapeHtml(identVal)}</span>`;
        }
        return `<span class="ax-ident">${escapeHtml(identVal)}</span>`;
      }

      return escapeHtml(match);
    }
  );

  return highlighted;
}
