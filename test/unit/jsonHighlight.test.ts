import { describe, it, expect } from 'vitest';
import { escapeHtml, highlightJson } from '../../webview-src/shared/jsonHighlight.js';

describe('jsonHighlight', () => {
  it('escapes HTML characters safely', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('tokens keys, strings, numbers, booleans, and nulls with span classes', () => {
    const data = {
      name: 'Alice',
      age: 28,
      active: true,
      data: null,
    };

    const html = highlightJson(data);
    expect(html).toContain('<span class="j-key">&quot;name&quot;</span>:');
    expect(html).toContain('<span class="j-str">&quot;Alice&quot;</span>');
    expect(html).toContain('<span class="j-num">28</span>');
    expect(html).toContain('<span class="j-bool">true</span>');
    expect(html).toContain('<span class="j-null">null</span>');
  });

  it('falls back to plain-json for payloads exceeding 1MB limit', () => {
    const largeObj = {
      text: 'a'.repeat(1_000_100),
    };
    const html = highlightJson(largeObj);
    expect(html.startsWith('<pre class="plain-json">')).toBe(true);
  });
});
