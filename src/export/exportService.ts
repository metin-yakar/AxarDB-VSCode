import * as vscode from 'vscode';
import * as fs from 'fs';
import { Doc, ExportFormat, ServerId } from '../contracts/types.js';
import { IExportService, IAxarClient, IQueryBuilder } from '../contracts/services.js';
import { Logger } from '../util/logger.js';

export function flattenDoc(doc: Doc, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(doc)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenDoc(value as Doc, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

export function escapeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function docsToCsv(docs: Doc[]): string {
  if (docs.length === 0) return '';

  const flattened = docs.map((d) => flattenDoc(d));
  const headersSet = new Set<string>();

  for (const item of flattened) {
    for (const key of Object.keys(item)) {
      headersSet.add(key);
    }
  }

  const headers = Array.from(headersSet);
  // Ensure _id is first if present
  if (headersSet.has('_id')) {
    const idx = headers.indexOf('_id');
    headers.splice(idx, 1);
    headers.unshift('_id');
  }

  const lines: string[] = [headers.map(escapeCsvValue).join(',')];

  for (const item of flattened) {
    const row = headers.map((h) => escapeCsvValue(item[h]));
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

export function formatSuggestedFilename(collection: string, format: ExportFormat): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const ext = format === 'csv' ? 'csv' : format === 'jsonl' ? 'jsonl' : 'json';
  return `${collection}-${stamp}.${ext}`;
}

export class ExportService implements IExportService {
  constructor(
    private readonly clientProvider?: (serverId: ServerId) => IAxarClient | undefined,
    private readonly queryBuilder?: IQueryBuilder
  ) {}

  public async exportDocs(
    docs: Doc[],
    format: ExportFormat,
    suggestedName: string
  ): Promise<vscode.Uri | undefined> {
    const filters: Record<string, string[]> =
      format === 'csv'
        ? { 'CSV Files': ['csv'] }
        : format === 'jsonl'
        ? { 'JSON Lines Files': ['jsonl'] }
        : { 'JSON Files': ['json'] };

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedName),
      filters,
    });

    if (!uri) return undefined;

    let content = '';
    if (format === 'json') {
      content = JSON.stringify(docs, null, 2);
    } else if (format === 'jsonl') {
      content = docs.map((d) => JSON.stringify(d)).join('\n') + (docs.length > 0 ? '\n' : '');
    } else {
      content = docsToCsv(docs);
    }

    await fs.promises.writeFile(uri.fsPath, content, 'utf8');
    Logger.info(`Exported ${docs.length} docs to ${uri.fsPath}`);
    return uri;
  }

  public async exportCollection(
    serverId: ServerId,
    collection: string,
    format: ExportFormat,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ): Promise<vscode.Uri | undefined> {
    if (!this.clientProvider || !this.queryBuilder) {
      throw new Error('ExportService requires clientProvider and queryBuilder');
    }

    const client = this.clientProvider(serverId);
    if (!client) {
      throw new Error(`Client for server '${serverId}' not found or disconnected`);
    }

    const suggestedName = formatSuggestedFilename(collection, format);
    const filters: Record<string, string[]> =
      format === 'csv'
        ? { 'CSV Files': ['csv'] }
        : format === 'jsonl'
        ? { 'JSON Lines Files': ['jsonl'] }
        : { 'JSON Files': ['json'] };

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(suggestedName),
      filters,
    });

    if (!uri) return undefined;

    // Get total count first
    const countRes = await client.query({
      serverId,
      script: `db.${collection}.count()`,
    });

    const totalCount = typeof countRes.data === 'number' ? countRes.data : 0;
    const chunkSize = 1000;
    let fetched = 0;

    const stream = fs.createWriteStream(uri.fsPath, { encoding: 'utf8' });

    try {
      if (format === 'json') {
        stream.write('[\n');
      }

      let isFirstDoc = true;
      let headersWritten = false;

      while (!token.isCancellationRequested && (totalCount === 0 || fetched < totalCount)) {
        const pageReq = this.queryBuilder.page({
          collection,
          kind: 'db',
          skip: fetched,
          take: chunkSize,
        });

        const queryRes = await client.query({
          serverId,
          script: pageReq.script,
          params: pageReq.params as Record<string, string | number | boolean>,
        });

        const docs = queryRes.docs || [];
        if (docs.length === 0) break;

        if (format === 'json') {
          for (const doc of docs) {
            if (!isFirstDoc) {
              stream.write(',\n');
            }
            stream.write(JSON.stringify(doc, null, 2));
            isFirstDoc = false;
          }
        } else if (format === 'jsonl') {
          for (const doc of docs) {
            stream.write(JSON.stringify(doc) + '\n');
          }
        } else if (format === 'csv') {
          if (!headersWritten) {
            const csvChunk = docsToCsv(docs);
            stream.write(csvChunk + '\n');
            headersWritten = true;
          } else {
            // For subsequent chunks, omit headers
            const flattened = docs.map((d) => flattenDoc(d));
            for (const item of flattened) {
              // Write csv row
              const row = Object.values(item).map(escapeCsvValue);
              stream.write(row.join(',') + '\n');
            }
          }
        }

        fetched += docs.length;
        const inc = totalCount > 0 ? (docs.length / totalCount) * 100 : 0;
        progress.report({
          message: `${fetched} / ${totalCount} records`,
          increment: inc,
        });

        if (docs.length < chunkSize) break;
      }

      if (format === 'json') {
        stream.write('\n]\n');
      }

      await new Promise<void>((resolve, reject) => {
        stream.end(() => resolve());
        stream.on('error', reject);
      });

      Logger.info(`Collection export complete: ${fetched} docs to ${uri.fsPath}`);
      return uri;
    } catch (err) {
      stream.destroy();
      throw err;
    }
  }
}
