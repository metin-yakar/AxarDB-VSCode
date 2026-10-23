import {
  Doc,
  PageRequest,
  LogQuery,
  TemplateKind,
  CollectionKind,
} from '../contracts/types.js';
import { IQueryBuilder } from '../contracts/services.js';

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function formatCollectionAccessor(kind: CollectionKind, collection: string): string {
  const isIdentifier = isValidIdentifier(collection);
  const accessor = isIdentifier ? `.${collection}` : `["${collection.replace(/["\\]/g, '\\$&')}"]`;

  switch (kind) {
    case 'db':
    case 'system':
      return `db${accessor}`;
    case 'memory':
      return `memory${accessor}`;
    case 'bulk':
      return `bulk${accessor}`;
    case 'log':
      return 'db.syslogs';
    case 'view':
      return `db.getView("${collection.replace(/["\\]/g, '\\$&')}")`;
    case 'trigger':
      return `db.getTrigger("${collection.replace(/["\\]/g, '\\$&')}")`;
    default:
      return `db${accessor}`;
  }
}

export class QueryBuilder implements IQueryBuilder {
  public page(req: PageRequest): { script: string; countScript: string; params: Record<string, unknown> } {
    const target = formatCollectionAccessor(req.kind, req.collection);

    if (req.kind === 'view' || req.kind === 'trigger') {
      return {
        script: target,
        countScript: '1',
        params: {},
      };
    }

    let predicate = 'x => true';
    if (req.filter && req.filter.trim().length > 0) {
      const trimmed = req.filter.trim();
      predicate = trimmed.startsWith('(') || trimmed.startsWith('x =>') || trimmed.includes('=>')
        ? trimmed
        : `x => ${trimmed}`;
    }

    let script = `${target}.findall(${predicate})`;

    if (req.sort && req.sort.field) {
      const sortMethod = req.sort.dir === 'desc' ? 'orderByDesc' : 'orderBy';
      script += `.${sortMethod}(x => x.${req.sort.field})`;
    }

    script += '.skip(@__skip).take(@__take)';

    const countScript = (predicate === 'x => true')
      ? `${target}.count()`
      : `${target}.findall(${predicate}).count()`;

    return {
      script,
      countScript,
      params: {
        __skip: req.skip,
        __take: req.take,
      },
    };
  }

  public insert(collection: string, doc: Doc): string {
    const target = formatCollectionAccessor('db', collection);
    const safeDoc = { ...doc };
    delete safeDoc._id;
    return `${target}.insert(${JSON.stringify(safeDoc, null, 2)})`;
  }

  public updateById(collection: string, id: string, patch: Doc): { script: string; params: { id: string } } {
    const target = formatCollectionAccessor('db', collection);
    const safePatch = { ...patch };
    delete safePatch._id;
    return {
      script: `${target}.update(x => x._id == @id, ${JSON.stringify(safePatch, null, 2)})`,
      params: { id },
    };
  }

  public replaceById(collection: string, id: string, doc: Doc): { script: string; params: { id: string } } {
    const target = formatCollectionAccessor('db', collection);
    const safeDoc = { ...doc };
    delete safeDoc._id;
    return {
      script: `${target}.update(x => x._id == @id, ${JSON.stringify(safeDoc, null, 2)})`,
      params: { id },
    };
  }

  public deleteById(collection: string, id: string): { script: string; params: { id: string } } {
    const target = formatCollectionAccessor('db', collection);
    return {
      script: `${target}.delete(x => x._id == @id)`,
      params: { id },
    };
  }

  public logs(q: LogQuery): { script: string; params: Record<string, unknown> } {
    const take = q.take || 200;
    const params: Record<string, unknown> = { take };

    if (q.type === 'queue' || q.type === 'view' || q.type === 'trigger') {
      let script = `log.${q.type}`;
      if (q.collection) {
        params.col = q.collection;
        script += '.findall(l => l.query.contains(@col))';
      }
      script += '.take(@take)';
      return { script, params };
    }

    if (q.type === 'backup') {
      let script = 'log.backup';
      if (q.collection) {
        params.col = q.collection;
        script += '.findall(l => l.query.contains(@col))';
      }
      script += '.take(@take)';
      return { script, params };
    }

    // Default syslogs for request, error, debug, all
    let filterPredicate = 'l => true';
    if (q.type !== 'all' && q.collection) {
      params.logType = q.type;
      params.col = q.collection;
      filterPredicate = 'l => l.type == @logType && l.query.contains(@col)';
    } else if (q.type !== 'all') {
      params.logType = q.type;
      filterPredicate = 'l => l.type == @logType';
    } else if (q.collection) {
      params.col = q.collection;
      filterPredicate = 'l => l.query.contains(@col)';
    }

    const script = `db.syslogs.findall(${filterPredicate}).take(@take)`;
    return { script, params };
  }

  public template(
    kind: TemplateKind,
    collection: string,
    ctx?: { doc?: Doc; kindOfStore?: CollectionKind }
  ): string {
    const target = formatCollectionAccessor(ctx?.kindOfStore || 'db', collection);

    switch (kind) {
      case 'find':
        return `// AxarDB: Find documents matching condition\n${target}.findall(x => x.status == "active").take(50);`;

      case 'findOne':
        return `// AxarDB: Find single document by _id\n${target}.find(x => x._id == "doc_id_here");`;

      case 'count':
        return `// AxarDB: Count documents in collection\n${target}.count();`;

      case 'insert': {
        let sample: Record<string, unknown> = {
          name: 'Example item',
          active: true,
          createdDate: new Date().toISOString(),
        };
        if (ctx?.doc) {
          sample = {};
          for (const [k, v] of Object.entries(ctx.doc)) {
            if (k !== '_id') {
              sample[k] = typeof v === 'string' ? '' : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : null;
            }
          }
        }
        return `// AxarDB: Insert new document\n${target}.insert(${JSON.stringify(sample, null, 2)});`;
      }

      case 'update':
        return `// AxarDB: Update documents matching condition\n${target}.update(x => x.status == "pending", {\n  status: "processed"\n});`;

      case 'updateById':
        return `// AxarDB: Update document by _id\n${target}.update(x => x._id == "doc_id_here", {\n  updatedAt: new Date().toISOString()\n});`;

      case 'delete':
        return `// CAUTION: Delete documents matching predicate\n${target}.delete(x => x.isDeleted == true);`;

      case 'deleteById':
        return `// CAUTION: Delete document by _id\n${target}.delete(x => x._id == "doc_id_here");`;

      default:
        return `${target}.count();`;
    }
  }
}
