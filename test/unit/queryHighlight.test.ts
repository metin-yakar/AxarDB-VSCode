import { describe, it, expect } from 'vitest';
import { highlightAxarQuery } from '../../webview-src/shared/queryHighlight.js';
import {
  extractColumnsFromDocs,
  getAxarSuggestions,
} from '../../webview-src/dataPanel/autocomplete.js';
import { store } from '../../webview-src/dataPanel/store.js';

describe('queryHighlight', () => {
  it('highlights roots, collections, methods, params, operators and numbers', () => {
    const script = 'db.customers.findall(x => x.balance > 100).skip(0).take(50)';
    const html = highlightAxarQuery(script);

    expect(html).toContain('<span class="ax-root">db</span>');
    expect(html).toContain('.<span class="ax-field">customers</span>');
    expect(html).toContain('.<span class="ax-method">findall</span>');
    expect(html).toContain('<span class="ax-param">x</span>');
    expect(html).toContain('<span class="ax-op">=&gt;</span>');
    expect(html).toContain('.<span class="ax-field">balance</span>');
    expect(html).toContain('<span class="ax-op">&gt;</span>');
    expect(html).toContain('<span class="ax-num">100</span>');
    expect(html).toContain('.<span class="ax-method">skip</span>');
    expect(html).toContain('.<span class="ax-method">take</span>');
  });

  it('highlights string literals and query parameter tags', () => {
    const script = 'db.users.find(x => x.name == "admin" && x.id == @id)';
    const html = highlightAxarQuery(script);

    expect(html).toContain('<span class="ax-str">&quot;admin&quot;</span>');
    expect(html).toContain('<span class="ax-param-tag">@id</span>');
    expect(html).toContain('<span class="ax-op">==</span>');
    expect(html).toContain('<span class="ax-op">&amp;&amp;</span>');
  });
});

describe('autocomplete', () => {
  it('extracts unique columns and their types from docs', () => {
    const docs = [
      { _id: '1', email: 'alice@test.com', balance: 50 },
      { _id: '2', email: 'bob@test.com', active: true, tags: ['vip'] },
    ];
    const cols = extractColumnsFromDocs(docs);

    expect(cols.some((c) => c.name === '_id')).toBe(true);
    expect(cols.some((c) => c.name === 'email' && c.type === 'string')).toBe(true);
    expect(cols.some((c) => c.name === 'balance' && c.type === 'number')).toBe(true);
    expect(cols.some((c) => c.name === 'active' && c.type === 'boolean')).toBe(true);
    expect(cols.some((c) => c.name === 'tags' && c.type === 'array')).toBe(true);
  });

  it('suggests known collections after db. prefix', () => {
    store.update({
      collection: 'customers',
      knownCollections: ['customers', 'orders', 'products'],
    });

    const { suggestions } = getAxarSuggestions('db.');
    const labels = suggestions.map((s) => s.label);

    expect(labels).toContain('customers');
    expect(labels).toContain('orders');
    expect(labels).toContain('products');
  });

  it('suggests datatable columns after x. property accessor', () => {
    store.update({
      docs: [
        { _id: '101', email: 'user@axardb.com', balance: 250, status: 'active' },
      ],
    });

    const { suggestions } = getAxarSuggestions('db.customers.findall(x => x.');
    const labels = suggestions.map((s) => s.label);

    expect(labels).toContain('_id');
    expect(labels).toContain('email');
    expect(labels).toContain('balance');
    expect(labels).toContain('status');
  });

  it('filters column suggestions by typed prefix', () => {
    store.update({
      docs: [
        { _id: '101', email: 'user@axardb.com', balance: 250, status: 'active' },
      ],
    });

    const { suggestions, replaceLength } = getAxarSuggestions('db.customers.findall(x => x.ba');
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]?.label).toBe('balance');
    expect(replaceLength).toBe(2);
  });

  it('suggests AxarDB methods after collection accessor', () => {
    const { suggestions } = getAxarSuggestions('db.customers.');
    const labels = suggestions.map((s) => s.label);

    expect(labels).toContain('findall(x => )');
    expect(labels).toContain('find(x => )');
    expect(labels).toContain('count()');
    expect(labels).toContain('insert({})');
    expect(labels).toContain('update(x => , {})');
    expect(labels).toContain('delete(x => )');
  });

  it('suggests chaining query methods after closing parenthesis', () => {
    const { suggestions } = getAxarSuggestions('db.customers.findall(x => true).');
    const labels = suggestions.map((s) => s.label);

    expect(labels).toContain('skip(0)');
    expect(labels).toContain('take(50)');
    expect(labels).toContain('orderBy(x => x.)');
    expect(labels).toContain('orderByDesc(x => x.)');
    expect(labels).toContain('toList()');
  });
});
