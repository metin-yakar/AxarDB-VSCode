export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const MAX_HIGHLIGHT_SIZE = 1_000_000; // 1 MB limit

export function highlightJson(json: unknown): string {
  let str: string;
  try {
    str = typeof json === 'string' ? JSON.stringify(JSON.parse(json), null, 2) : JSON.stringify(json, null, 2);
  } catch {
    str = String(json);
  }

  if (str.length > MAX_HIGHLIGHT_SIZE) {
    return `<pre class="plain-json">${escapeHtml(str)}</pre>`;
  }

  // Regex tokenizer matching string literals / keys, numbers, booleans, and null
  const regex = /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/g;

  const highlighted = str.replace(regex, (match, stringVal, _esc, isKey, keywordVal) => {
    if (stringVal) {
      const safe = escapeHtml(stringVal);
      if (isKey) {
        return `<span class="j-key">${safe}</span>:`;
      }
      return `<span class="j-str">${safe}</span>`;
    }
    if (keywordVal) {
      if (keywordVal === 'null') {
        return `<span class="j-null">${keywordVal}</span>`;
      }
      return `<span class="j-bool">${keywordVal}</span>`;
    }
    return `<span class="j-num">${match}</span>`;
  });

  return `<pre class="highlighted-json"><code>${highlighted}</code></pre>`;
}
