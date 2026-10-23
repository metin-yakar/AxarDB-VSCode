import { describe, it, expect } from 'vitest';
import { flattenDoc, escapeCsvValue, docsToCsv, formatSuggestedFilename } from '../../src/export/exportService.js';

describe('ExportService helpers', () => {
  describe('flattenDoc', () => {
    it('flattens nested objects into dot notation', () => {
      const input = {
        _id: '1',
        name: 'John',
        address: {
          city: 'Baku',
          geo: { lat: 40.4, lng: 49.8 },
        },
      };

      const flattened = flattenDoc(input);
      expect(flattened).toEqual({
        _id: '1',
        name: 'John',
        'address.city': 'Baku',
        'address.geo.lat': 40.4,
        'address.geo.lng': 49.8,
      });
    });

    it('keeps arrays as array values rather than splitting keys', () => {
      const input = {
        _id: '2',
        tags: ['db', 'fast'],
      };

      const flattened = flattenDoc(input);
      expect(flattened).toEqual({
        _id: '2',
        tags: ['db', 'fast'],
      });
    });
  });

  describe('escapeCsvValue', () => {
    it('escapes commas, quotes, and newlines per RFC 4180', () => {
      expect(escapeCsvValue('normal')).toBe('normal');
      expect(escapeCsvValue('hello, world')).toBe('"hello, world"');
      expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
      expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
      expect(escapeCsvValue(123)).toBe('123');
    });
  });

  describe('docsToCsv', () => {
    it('generates CSV with _id as first column followed by all fields', () => {
      const docs = [
        { _id: '1', name: 'Alice', age: 30 },
        { _id: '2', name: 'Bob', city: 'London' },
      ];

      const csv = docsToCsv(docs);
      const lines = csv.split('\n');

      expect(lines[0]!.startsWith('_id,')).toBe(true);
      expect(lines[0]!.includes('name')).toBe(true);
      expect(lines[0]!.includes('age')).toBe(true);
      expect(lines[0]!.includes('city')).toBe(true);
      expect(lines.length).toBe(3); // header + 2 rows
    });
  });

  describe('formatSuggestedFilename', () => {
    it('creates filename with timestamp and correct extension', () => {
      const name = formatSuggestedFilename('users', 'csv');
      expect(name.startsWith('users-')).toBe(true);
      expect(name.endsWith('.csv')).toBe(true);

      const jsonName = formatSuggestedFilename('orders', 'json');
      expect(jsonName.endsWith('.json')).toBe(true);

      const jsonlName = formatSuggestedFilename('logs', 'jsonl');
      expect(jsonlName.endsWith('.jsonl')).toBe(true);
    });
  });
});
