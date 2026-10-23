export const Commands = {
  // Server Commands
  SERVER_ADD: 'axardb.server.add',
  SERVER_EDIT: 'axardb.server.edit',
  SERVER_REMOVE: 'axardb.server.remove',
  SERVER_CONNECT: 'axardb.server.connect',
  SERVER_DISCONNECT: 'axardb.server.disconnect',
  SERVER_REFRESH: 'axardb.server.refresh',

  // Connections View Commands
  CONNECTIONS_FOCUS_FILTER: 'axardb.connections.focusFilter',

  // Category Commands
  CATEGORY_REFRESH: 'axardb.category.refresh',
  CATEGORY_COLLAPSE_ALL: 'axardb.category.collapseAll',

  // Collection Commands
  COLLECTION_OPEN: 'axardb.collection.open',
  COLLECTION_COPY_NAME: 'axardb.collection.copyName',
  COLLECTION_DROP: 'axardb.collection.drop',
  COLLECTION_EXPORT_JSON: 'axardb.collection.exportJson',
  COLLECTION_EXPORT_JSONL: 'axardb.collection.exportJsonl',
  COLLECTION_EXPORT_CSV: 'axardb.collection.exportCsv',

  // Templates
  TEMPLATE_FIND: 'axardb.collection.template.find',
  TEMPLATE_FIND_ONE: 'axardb.collection.template.findOne',
  TEMPLATE_COUNT: 'axardb.collection.template.count',
  TEMPLATE_INSERT: 'axardb.collection.template.insert',
  TEMPLATE_UPDATE: 'axardb.collection.template.update',
  TEMPLATE_UPDATE_BY_ID: 'axardb.collection.template.updateById',
  TEMPLATE_DELETE: 'axardb.collection.template.delete',
  TEMPLATE_DELETE_BY_ID: 'axardb.collection.template.deleteById',

  // Logs
  LOGS_REQUEST: 'axardb.collection.logs.request',
  LOGS_ERROR: 'axardb.collection.logs.error',
  LOGS_DEBUG: 'axardb.collection.logs.debug',
  LOGS_BACKUP: 'axardb.collection.logs.backup',
  LOGS_QUEUE: 'axardb.collection.logs.queue',
  LOGS_VIEW: 'axardb.collection.logs.view',
  LOGS_TRIGGER: 'axardb.collection.logs.trigger',
  LOGS_ALL: 'axardb.collection.logs.all',

  // Views & Triggers
  VIEW_OPEN: 'axardb.view.open',
  VIEW_RUN: 'axardb.view.run',
  VIEW_DELETE: 'axardb.view.delete',
  TRIGGER_OPEN: 'axardb.trigger.open',
  TRIGGER_DELETE: 'axardb.trigger.delete',

  // Row Commands
  ROW_COPY_JSON: 'axardb.row.copyJson',
  ROW_COPY_ID: 'axardb.row.copyId',
  ROW_EDIT: 'axardb.row.edit',
  ROW_DUPLICATE: 'axardb.row.duplicate',
  ROW_DELETE: 'axardb.row.delete',
  ROW_GEN_UPDATE: 'axardb.row.genUpdate',
  ROW_GEN_DELETE: 'axardb.row.genDelete',
  ROW_SHOW_LOGS: 'axardb.row.showLogs',
  ROW_FILTER_BY_FIELD: 'axardb.row.filterByField',

  // Query Editor
  QUERY_NEW_EDITOR: 'axardb.query.newEditor',
  QUERY_RUN: 'axardb.query.run',
  QUERY_RUN_SELECTION: 'axardb.query.runSelection',

  // History
  HISTORY_SHOW: 'axardb.history.show',
} as const;

export type CommandId = (typeof Commands)[keyof typeof Commands];
