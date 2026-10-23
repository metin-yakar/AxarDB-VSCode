import * as vscode from 'vscode';
import { ServerConfig } from '../contracts/types.js';
import { IConnectionManager, IAxarClient } from '../contracts/services.js';

export interface ServerEditResult {
  config: Omit<ServerConfig, 'id'> | ServerConfig;
  password?: string;
}

export class ServerEditor {
  constructor(
    private readonly connectionManager: IConnectionManager,
    private readonly clientFactory?: (config: ServerConfig, password: string) => IAxarClient
  ) {}

  public async promptAdd(): Promise<ServerConfig | undefined> {
    const name = await vscode.window.showInputBox({
      title: 'AxarDB: Add Server (1/5)',
      prompt: 'Enter server display name',
      placeHolder: 'Local AxarDB',
      validateInput: (val) => (!val || val.trim().length === 0 ? 'Name is required' : null),
    });
    if (!name) return undefined;

    const url = await vscode.window.showInputBox({
      title: 'AxarDB: Add Server (2/5)',
      prompt: 'Enter server URL (http://host:port)',
      value: 'http://localhost:5000',
      validateInput: (val) => {
        if (!val) return 'URL is required';
        try {
          const u = new URL(val);
          if (!['http:', 'https:'].includes(u.protocol)) {
            return 'URL must use http or https protocol';
          }
          return null;
        } catch {
          return 'Invalid URL format';
        }
      },
    });
    if (!url) return undefined;

    const username = await vscode.window.showInputBox({
      title: 'AxarDB: Add Server (3/5)',
      prompt: 'Enter username',
      value: 'unlocker',
    });
    if (username === undefined) return undefined;

    const password = await vscode.window.showInputBox({
      title: 'AxarDB: Add Server (4/5)',
      prompt: 'Enter password',
      password: true,
      value: 'unlocker',
    });
    if (password === undefined) return undefined;

    const color = await vscode.window.showQuickPick(
      [
        { label: '$(circle-filled) Blue', description: '#3794ff', value: '#3794ff' },
        { label: '$(circle-filled) Green', description: '#4ec9b0', value: '#4ec9b0' },
        { label: '$(circle-filled) Orange', description: '#ce9178', value: '#ce9178' },
        { label: '$(circle-filled) Purple', description: '#c586c0', value: '#c586c0' },
        { label: '$(circle-filled) Red', description: '#f14c4c', value: '#f14c4c' },
        { label: '$(circle-filled) Default (No color)', description: 'None', value: undefined },
      ],
      { title: 'AxarDB: Add Server (5/5) - Select Badge Color' }
    );
    if (!color) return undefined;

    const cfg: Omit<ServerConfig, 'id'> = {
      name: name.trim(),
      url: url.trim(),
      username: username.trim(),
      color: color.value,
      timeoutMs: 30000,
    };

    return await this.connectionManager.add(cfg, password);
  }

  public async promptEdit(existing: ServerConfig): Promise<void> {
    const name = await vscode.window.showInputBox({
      title: `AxarDB: Edit Server '${existing.name}' (1/4)`,
      prompt: 'Enter server display name',
      value: existing.name,
      validateInput: (val) => (!val || val.trim().length === 0 ? 'Name is required' : null),
    });
    if (!name) return;

    const url = await vscode.window.showInputBox({
      title: `AxarDB: Edit Server '${existing.name}' (2/4)`,
      prompt: 'Enter server URL',
      value: existing.url,
      validateInput: (val) => {
        try {
          new URL(val);
          return null;
        } catch {
          return 'Invalid URL';
        }
      },
    });
    if (!url) return;

    const username = await vscode.window.showInputBox({
      title: `AxarDB: Edit Server '${existing.name}' (3/4)`,
      prompt: 'Enter username',
      value: existing.username,
    });
    if (username === undefined) return;

    const password = await vscode.window.showInputBox({
      title: `AxarDB: Edit Server '${existing.name}' (4/4)`,
      prompt: 'Enter new password (leave blank to keep existing)',
      password: true,
    });
    if (password === undefined) return;

    const updated: ServerConfig = {
      ...existing,
      name: name.trim(),
      url: url.trim(),
      username: username.trim(),
    };

    await this.connectionManager.update(updated, password || undefined);
  }
}
