import * as vscode from 'vscode';
import { IConnectionManager } from '../contracts/services.js';
import { ServerEditor } from '../connections/serverEditor.js';
import { ConnectionsViewProvider } from '../views/connections/connectionsViewProvider.js';

export function registerServerCommands(
  context: vscode.ExtensionContext,
  connectionManager: IConnectionManager,
  serverEditor: ServerEditor,
  connectionsViewProvider: ConnectionsViewProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('axardb.server.add', async () => {
      await serverEditor.promptAdd();
    }),

    vscode.commands.registerCommand('axardb.server.edit', async (arg?: { serverId?: string }) => {
      let serverId = arg?.serverId;
      if (!serverId) {
        const servers = connectionManager.list();
        if (servers.length === 0) {
          vscode.window.showInformationMessage('No AxarDB servers to edit.');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          servers.map((s) => ({ label: s.name, description: s.url, server: s })),
          { title: 'Select Server to Edit' }
        );
        if (!picked) return;
        serverId = picked.server.id;
      }

      const server = connectionManager.get(serverId);
      if (server) {
        await serverEditor.promptEdit(server);
      }
    }),

    vscode.commands.registerCommand('axardb.server.remove', async (arg?: { serverId?: string }) => {
      let serverId = arg?.serverId;
      if (!serverId) {
        const servers = connectionManager.list();
        if (servers.length === 0) return;
        const picked = await vscode.window.showQuickPick(
          servers.map((s) => ({ label: s.name, description: s.url, id: s.id })),
          { title: 'Select Server to Remove' }
        );
        if (!picked) return;
        serverId = picked.id;
      }

      const server = connectionManager.get(serverId);
      if (!server) return;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to remove '${server.name}' (${server.url})?`,
        { modal: true },
        'Remove'
      );

      if (confirm === 'Remove') {
        await connectionManager.remove(serverId);
      }
    }),

    vscode.commands.registerCommand('axardb.server.connect', async (arg?: { serverId?: string }) => {
      let serverId = arg?.serverId;
      if (!serverId) {
        const servers = connectionManager.list();
        const picked = await vscode.window.showQuickPick(
          servers.map((s) => ({ label: s.name, description: s.url, id: s.id })),
          { title: 'Select Server to Connect' }
        );
        if (!picked) return;
        serverId = picked.id;
      }

      try {
        await connectionManager.connect(serverId);
        await connectionsViewProvider.loadCategoriesForServer(serverId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Connection failed: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('axardb.server.disconnect', async (arg?: { serverId?: string }) => {
      let serverId = arg?.serverId;
      if (!serverId) {
        const servers = connectionManager.list();
        const connected = servers.filter((s) => connectionManager.state(s.id) === 'connected');
        if (connected.length === 0) return;
        const picked = await vscode.window.showQuickPick(
          connected.map((s) => ({ label: s.name, description: s.url, id: s.id })),
          { title: 'Select Server to Disconnect' }
        );
        if (!picked) return;
        serverId = picked.id;
      }

      connectionManager.disconnect(serverId);
    }),

    vscode.commands.registerCommand('axardb.server.refresh', async (arg?: { serverId?: string }) => {
      if (arg?.serverId) {
        await connectionsViewProvider.loadCategoriesForServer(arg.serverId);
      } else {
        await vscode.commands.executeCommand('axardb.category.refresh');
      }
    })
  );
}
