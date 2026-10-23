import * as vscode from 'vscode';
import { DataPanelManager } from '../views/dataPanel/dataPanelManager.js';
import { IQueryBuilder, IAxarClient } from '../contracts/services.js';
import { LogsPanelService } from '../views/logs/logsPanel.js';
import { QueryRunner } from '../editor/queryRunner.js';
import { Doc } from '../contracts/types.js';

export interface RowContextArg {
  webviewSection?: 'row';
  rowIndex?: number;
}

export function registerRowCommands(
  context: vscode.ExtensionContext,
  dataPanelManager: DataPanelManager,
  clientProvider: (serverId: string) => IAxarClient | undefined,
  queryBuilder: IQueryBuilder,
  logsPanelService: LogsPanelService,
  queryRunner: QueryRunner
): void {
  const resolveTargetRow = (arg?: RowContextArg): { doc: Doc; rowIndex: number } | undefined => {
    const activePanel = dataPanelManager.active();
    if (!activePanel) {
      vscode.window.showWarningMessage('No active AxarDB collection tab.');
      return undefined;
    }

    const rowIndex = arg?.rowIndex !== undefined ? arg.rowIndex : 0;
    const doc = activePanel.getRow(rowIndex);
    if (!doc) {
      vscode.window.showWarningMessage('Selected row not found in active data cache.');
      return undefined;
    }

    return { doc, rowIndex };
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('axardb.row.copyJson', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (target) {
        await vscode.env.clipboard.writeText(JSON.stringify(target.doc, null, 2));
        vscode.window.showInformationMessage('Copied document JSON to clipboard.');
      }
    }),

    vscode.commands.registerCommand('axardb.row.copyId', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (target) {
        if (!target.doc._id) {
          vscode.window.showWarningMessage('Document does not have an _id field.');
          return;
        }
        await vscode.env.clipboard.writeText(String(target.doc._id));
        vscode.window.showInformationMessage(`Copied _id: ${target.doc._id}`);
      }
    }),

    vscode.commands.registerCommand('axardb.row.edit', (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (target) {
        const active = dataPanelManager.active();
        // Trigger edit in webview
        active?.setQuery('', false);
      }
    }),

    vscode.commands.registerCommand('axardb.row.duplicate', (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (target) {
        // Open insert dialog prefilled with doc
        vscode.window.showInformationMessage('Use Insert Record on toolbar to add duplicates.');
      }
    }),

    vscode.commands.registerCommand('axardb.row.delete', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (!target) return;

      const active = dataPanelManager.active();
      if (!active) return;

      if (!target.doc._id) {
        vscode.window.showErrorMessage('Cannot delete document without _id.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete document with _id '${target.doc._id}'?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        const client = clientProvider(active.options.serverId);
        if (!client) return;

        const { script, params } = queryBuilder.deleteById(active.options.collection, String(target.doc._id));
        const res = await client.query({
          serverId: active.options.serverId,
          script,
          params,
        });

        if (res.ok) {
          vscode.window.showInformationMessage(`Deleted record '${target.doc._id}'`);
          // Trigger reload
          active.setQuery('', false);
        } else {
          vscode.window.showErrorMessage(`Delete failed: ${res.error?.message}`);
        }
      }
    }),

    vscode.commands.registerCommand('axardb.row.genUpdate', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (!target) return;
      const active = dataPanelManager.active();
      if (!active) return;

      const safeDoc = { ...target.doc };
      delete safeDoc._id;
      const { script } = queryBuilder.updateById(active.options.collection, String(target.doc._id || 'doc_id'), safeDoc);

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.languageId === 'javascript') {
        activeEditor.edit((edit) => {
          edit.insert(activeEditor.selection.active, `\n${script}\n`);
        });
      } else {
        await queryRunner.newEditor(active.options.serverId, active.options.collection);
      }
    }),

    vscode.commands.registerCommand('axardb.row.genDelete', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (!target) return;
      const active = dataPanelManager.active();
      if (!active) return;

      const { script } = queryBuilder.deleteById(active.options.collection, String(target.doc._id || 'doc_id'));

      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.languageId === 'javascript') {
        activeEditor.edit((edit) => {
          edit.insert(activeEditor.selection.active, `\n${script}\n`);
        });
      } else {
        await queryRunner.newEditor(active.options.serverId, active.options.collection);
      }
    }),

    vscode.commands.registerCommand('axardb.row.showLogs', async (arg?: RowContextArg) => {
      const target = resolveTargetRow(arg);
      if (!target) return;
      const active = dataPanelManager.active();
      if (!active) return;

      await logsPanelService.openLogs(
        active.options.serverId,
        active.options.serverName,
        active.options.collection,
        'all'
      );
    })
  );
}
