// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createComplexFieldEditor } from '../../webview-src/dataPanel/recordTreeEditor.js';

describe('recordTreeEditor', () => {
  it('renders array items and reconstructs array value', () => {
    const initial = ['csharp', 'nosql'];
    const editor = createComplexFieldEditor(initial, false);

    expect(editor.element.querySelector('.ax-tree-header')).toBeTruthy();
    expect(editor.element.textContent).toContain('[2 items]');
    expect(editor.element.textContent).toContain('[0]');
    expect(editor.element.textContent).toContain('[1]');

    const reconstructed = editor.getValue();
    expect(reconstructed).toEqual(['csharp', 'nosql']);
  });

  it('renders object properties and reconstructs object value', () => {
    const initial = {
      city: 'Istanbul',
      zip: 34000,
      active: true,
    };
    const editor = createComplexFieldEditor(initial, false);

    expect(editor.element.textContent).toContain('{3 props}');
    expect(editor.element.textContent).toContain('city');
    expect(editor.element.textContent).toContain('zip');
    expect(editor.element.textContent).toContain('active');

    const reconstructed = editor.getValue();
    expect(reconstructed).toEqual({
      city: 'Istanbul',
      zip: 34000,
      active: true,
    });
  });

  it('supports deep nested hierarchical tree structures', () => {
    const complexData = {
      user: 'alice',
      tags: ['db', 'fast'],
      profile: {
        theme: 'dark',
        settings: {
          notifications: true,
          count: 5,
        },
      },
    };

    const editor = createComplexFieldEditor(complexData, false);
    const reconstructed = editor.getValue();

    expect(reconstructed).toEqual(complexData);
  });
});
