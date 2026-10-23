import * as vscode from 'vscode';
import { ServerConfig, ServerId, ConnectionState } from '../contracts/types.js';
import { IConnectionManager, IAxarClient } from '../contracts/services.js';
import { Logger } from '../util/logger.js';

const STORAGE_KEY_SERVERS = 'axardb.servers';
const SECRET_PREFIX = 'axardb.password.';

export class ConnectionManager implements IConnectionManager, vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private _servers: Map<ServerId, ServerConfig> = new Map();
  private _states: Map<ServerId, ConnectionState> = new Map();
  private _clientFactory: (config: ServerConfig, password: string) => IAxarClient;
  private _activeClients: Map<ServerId, IAxarClient> = new Map();

  constructor(
    private readonly memento: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
    clientFactory?: (config: ServerConfig, password: string) => IAxarClient
  ) {
    this._clientFactory = clientFactory || (() => {
      throw new Error('AxarClient factory not configured');
    });
    this.loadServers();
  }

  private loadServers(): void {
    const raw = this.memento.get<ServerConfig[]>(STORAGE_KEY_SERVERS, []);
    this._servers.clear();
    for (const s of raw) {
      this._servers.set(s.id, s);
      this._states.set(s.id, 'disconnected');
    }
  }

  private async persist(): Promise<void> {
    const list = Array.from(this._servers.values());
    await this.memento.update(STORAGE_KEY_SERVERS, list);
    this._onDidChange.fire();
  }

  public list(): ServerConfig[] {
    return Array.from(this._servers.values());
  }

  public get(id: ServerId): ServerConfig | undefined {
    return this._servers.get(id);
  }

  public async add(cfg: Omit<ServerConfig, 'id'>, password: string): Promise<ServerConfig> {
    const id = `srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullConfig: ServerConfig = {
      ...cfg,
      id,
      url: cfg.url.replace(/\/+$/, ''),
    };

    await this.secrets.store(`${SECRET_PREFIX}${id}`, password);
    this._servers.set(id, fullConfig);
    this._states.set(id, 'disconnected');
    await this.persist();
    Logger.info(`Server added: ${fullConfig.name} (${fullConfig.url})`);
    return fullConfig;
  }

  public async update(cfg: ServerConfig, password?: string): Promise<void> {
    if (!this._servers.has(cfg.id)) {
      throw new Error(`Server with id '${cfg.id}' not found`);
    }

    const updated: ServerConfig = {
      ...cfg,
      url: cfg.url.replace(/\/+$/, ''),
    };

    if (password !== undefined && password !== '') {
      await this.secrets.store(`${SECRET_PREFIX}${cfg.id}`, password);
    }

    this._servers.set(cfg.id, updated);
    await this.persist();
    Logger.info(`Server updated: ${updated.name}`);
  }

  public async remove(id: ServerId): Promise<void> {
    this.disconnect(id);
    this._servers.delete(id);
    this._states.delete(id);
    try {
      await this.secrets.delete(`${SECRET_PREFIX}${id}`);
    } catch {
      // Ignore if secret didn't exist
    }
    await this.persist();
    Logger.info(`Server removed: ${id}`);
  }

  public async getCredentials(id: ServerId): Promise<{ username: string; password: string }> {
    const server = this.get(id);
    if (!server) {
      throw new Error(`Server with id '${id}' not found`);
    }
    const password = (await this.secrets.get(`${SECRET_PREFIX}${id}`)) || '';
    return {
      username: server.username,
      password,
    };
  }

  public state(id: ServerId): ConnectionState {
    return this._states.get(id) || 'disconnected';
  }

  public getClient(id: ServerId): IAxarClient | undefined {
    return this._activeClients.get(id);
  }

  public async connect(id: ServerId): Promise<void> {
    const server = this.get(id);
    if (!server) {
      throw new Error(`Server with id '${id}' not found`);
    }

    this._states.set(id, 'connecting');
    this._onDidChange.fire();

    try {
      const { password } = await this.getCredentials(id);
      const client = this._clientFactory(server, password);
      const pingRes = await client.ping(id);

      if (!pingRes.ok) {
        throw new Error(pingRes.error || 'Ping failed');
      }

      this._activeClients.set(id, client);
      this._states.set(id, 'connected');
      Logger.info(`Server connected: ${server.name} in ${pingRes.elapsedMs}ms`);
      this._onDidChange.fire();
    } catch (err: unknown) {
      this._states.set(id, 'error');
      this._activeClients.delete(id);
      this._onDidChange.fire();
      const msg = err instanceof Error ? err.message : String(err);
      Logger.error(`Connection failed for ${server.name}: ${msg}`);
      throw err;
    }
  }

  public disconnect(id: ServerId): void {
    this._activeClients.delete(id);
    if (this._states.get(id) !== 'disconnected') {
      this._states.set(id, 'disconnected');
      this._onDidChange.fire();
    }
  }

  public dispose(): void {
    this._onDidChange.dispose();
    this._activeClients.clear();
  }
}
