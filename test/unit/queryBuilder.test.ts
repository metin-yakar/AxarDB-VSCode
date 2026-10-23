import { describe, it, expect } from 'vitest';
import { QueryBuilder, formatCollectionAccessor } from '../../src/query/queryBuilder.js';

describe('QueryBuilder', () => {
  const qb = new QueryBuilder();

  describe('formatCollectionAccessor', () => {
    it('formats standard alphanumeric names as db.name', () => {
      expect(formatCollectionAccessor('db', 'users')).toBe('db.users');
      expect(formatCollectionAccessor('system', 'sysusers')).toBe('db.sysusers');
      expect(formatCollectionAccessor('memory', 'cache')).toBe('memory.cache');
      expect(formatCollectionAccessor('bulk', 'archive_2026')).toBe('bulk.archive_2026');
      expect(formatCollectionAccessor('log', 'syslogs')).toBe('db.syslogs');
    });

    it('brackets special collection names', () => {
      expect(formatCollectionAccessor('db', 'user-orders')).toBe('db["user-orders"]');
      expect(formatCollectionAccessor('db', 'my.collection')).toBe('db["my.collection"]');
    });

    it('formats view and trigger accessors', () => {
      expect(formatCollectionAccessor('view', 'activeUsers')).toBe('db.getView("activeUsers")');
      expect(formatCollectionAccessor('trigger', 'onOrderCreated')).toBe('db.getTrigger("onOrderCreated")');
    });
  });

  describe('page', () => {
    it('generates standard pagination script without filter', () => {
      const res = qb.page({
        collection: 'users',
        kind: 'db',
        skip: 0,
        take: 50,
      });

      expect(res.script).toBe('db.users.findall(x => true).skip(@__skip).take(@__take)');
      expect(res.countScript).toBe('db.users.count()');
      expect(res.params).toEqual({ __skip: 0, __take: 50 });
    });

    it('supports custom filter predicate and sorting', () => {
      const res = qb.page({
        collection: 'users',
        kind: 'db',
        filter: 'x.age > 18',
        sort: { field: 'createdAt', dir: 'desc' },
        skip: 20,
        take: 10,
      });

      expect(res.script).toBe(
        'db.users.findall(x => x.age > 18).orderByDesc(x => x.createdAt).skip(@__skip).take(@__take)'
      );
      expect(res.countScript).toBe('db.users.findall(x => x.age > 18).count()');
      expect(res.params).toEqual({ __skip: 20, __take: 10 });
    });

    it('preserves arrow function format if user provided one', () => {
      const res = qb.page({
        collection: 'orders',
        kind: 'db',
        filter: 'x => x.total >= 100',
        skip: 0,
        take: 25,
      });

      expect(res.script).toContain('findall(x => x.total >= 100)');
    });
  });

  describe('CRUD operations', () => {
    it('generates insert statement stripping _id', () => {
      const script = qb.insert('users', { _id: 'temp_id', name: 'Alice', age: 30 });
      expect(script).toContain('db.users.insert(');
      expect(script).toContain('"name": "Alice"');
      expect(script).not.toContain('temp_id');
    });

    it('generates updateById with parameterized id', () => {
      const res = qb.updateById('users', 'u123', { _id: 'u123', status: 'verified' });
      expect(res.script).toBe('db.users.update(x => x._id == @id, {\n  "status": "verified"\n})');
      expect(res.params).toEqual({ id: 'u123' });
    });

    it('generates deleteById with parameterized id', () => {
      const res = qb.deleteById('users', 'u456');
      expect(res.script).toBe('db.users.delete(x => x._id == @id)');
      expect(res.params).toEqual({ id: 'u456' });
    });
  });

  describe('logs query generation', () => {
    it('generates syslogs query for request type filtered by collection', () => {
      const res = qb.logs({
        serverId: 's1',
        type: 'request',
        collection: 'orders',
        take: 100,
      });

      expect(res.script).toBe(
        'db.syslogs.findall(l => l.type == @logType && l.query.contains(@col)).take(@take)'
      );
      expect(res.params).toEqual({
        take: 100,
        logType: 'request',
        col: 'orders',
      });
    });

    it('generates queue logs query for queue type', () => {
      const res = qb.logs({
        serverId: 's1',
        type: 'queue',
        take: 50,
      });

      expect(res.script).toBe('log.queue.take(@take)');
      expect(res.params).toEqual({ take: 50 });
    });
  });

  describe('templates', () => {
    it('generates find template', () => {
      const t = qb.template('find', 'products');
      expect(t).toContain('db.products.findall(');
    });

    it('generates findOne template', () => {
      const t = qb.template('findOne', 'products');
      expect(t).toContain('db.products.find(x => x._id == "doc_id_here")');
    });

    it('generates insert template using doc schema when available', () => {
      const t = qb.template('insert', 'customers', {
        doc: { _id: '1', companyName: 'Acme', active: true, balance: 1000 },
      });
      expect(t).toContain('db.customers.insert(');
      expect(t).toContain('"companyName": ""');
      expect(t).toContain('"active": false');
      expect(t).toContain('"balance": 0');
      expect(t).not.toContain('_id');
    });
  });
});
