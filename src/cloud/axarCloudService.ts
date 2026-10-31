import * as vscode from 'vscode';
import {
  CloudBotChallenge,
  CloudDatabase,
  CloudProvisionedSession,
  CloudState,
  CloudUser,
  FastRegisterRequest,
  FastRegisterResponse,
  ServerConfig,
} from '../contracts/types.js';
import { IConnectionManager } from '../contracts/services.js';
import { Logger } from '../util/logger.js';
import {
  ALLOWED_FAST_EMAIL_DOMAINS,
  CloudExpireSummary,
  computeCloudExpireSummary,
  formatIsoDateTime,
  generateAnonymousFastRegisterParams,
  validateFastRegisterEmail,
  validateSubdomain,
} from './cloudHelpers.js';

export {
  ALLOWED_FAST_EMAIL_DOMAINS,
  CloudExpireSummary,
  computeCloudExpireSummary,
  formatIsoDateTime,
  generateAnonymousFastRegisterParams,
  validateFastRegisterEmail,
  validateSubdomain,
};

export const AXAR_CLOUD_BASE_URL = 'https://axardb.com';

const SECRET_CLOUD_TOKEN = 'axardb.cloud.sessionToken';
const SECRET_DB_KEY_PREFIX = 'axardb.cloud.dbKey.';
const SECRET_SUBDOMAIN_KEY_PREFIX = 'axardb.cloud.subKey.';
const STATE_CLOUD_USER = 'axardb.cloud.user';
const STATE_LAST_PROVISIONED = 'axardb.cloud.lastProvisioned';

export class AxarCloudService {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor(
    private readonly memento: vscode.Memento,
    private readonly secrets: vscode.SecretStorage,
    private readonly baseUrl: string = AXAR_CLOUD_BASE_URL
  ) {}

  public async getSessionToken(): Promise<string | undefined> {
    return this.secrets.get(SECRET_CLOUD_TOKEN);
  }

  public getUser(): CloudUser | null {
    return this.memento.get<CloudUser | null>(STATE_CLOUD_USER, null);
  }

  public getLastProvisioned(): CloudProvisionedSession | null {
    return this.memento.get<CloudProvisionedSession | null>(STATE_LAST_PROVISIONED, null);
  }

  public async getStoredApiKey(dbId: string, subdomain?: string): Promise<string | undefined> {
    const byId = await this.secrets.get(`${SECRET_DB_KEY_PREFIX}${dbId}`);
    if (byId) return byId;
    if (subdomain) {
      return this.secrets.get(`${SECRET_SUBDOMAIN_KEY_PREFIX}${subdomain}`);
    }
    return undefined;
  }

  public async storeApiKey(dbId: string, subdomain: string, apiKey: string): Promise<void> {
    if (!apiKey) return;
    await this.secrets.store(`${SECRET_DB_KEY_PREFIX}${dbId}`, apiKey);
    if (subdomain) {
      await this.secrets.store(`${SECRET_SUBDOMAIN_KEY_PREFIX}${subdomain}`, apiKey);
    }
  }

  private async buildHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extra,
    };
    const token = await this.getSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `ax_session=${token}`;
    }
    return headers;
  }

  private extractCookieToken(res: Response): string | undefined {
    const rawCookie = res.headers.get('set-cookie');
    if (!rawCookie) return undefined;
    const match = rawCookie.match(/ax_session=([^;\s,]+)/);
    return match?.[1];
  }

  public async getBotChallenge(): Promise<CloudBotChallenge | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/auth/bot-challenge`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      return (await res.json()) as CloudBotChallenge;
    } catch (err) {
      Logger.warn(`Failed to fetch AxarDB Cloud bot challenge: ${String(err)}`);
      return null;
    }
  }

  public async login(params: {
    email: string;
    password: string;
    botToken?: string;
    loadTs?: string;
    sessionToken?: string;
  }): Promise<{ user: CloudUser; databases: CloudDatabase[] }> {
    // Allow direct session token authentication if provided
    if (params.sessionToken && params.sessionToken.trim()) {
      const cleanToken = params.sessionToken.trim();
      await this.secrets.store(SECRET_CLOUD_TOKEN, cleanToken);
      const user = await this.fetchMe();
      const databases = await this.listDatabases();
      this._onDidChange.fire();
      return { user, databases };
    }

    const email = params.email.trim();
    if (!email || !params.password) {
      throw new Error('Email address and password are required.');
    }

    const bodyPayload: Record<string, unknown> = {
      email,
      password: params.password,
      _hp_security_check: '',
      _load_ts: params.loadTs || String(Date.now() - 4000),
    };
    if (params.botToken) {
      bodyPayload.bot_token = params.botToken;
      bodyPayload._bot_guard_enabled = true;
    }

    const res = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        (data.error as string) ||
        (data.message as string) ||
        `Sign in failed (HTTP ${res.status}).`;
      throw new Error(errMsg);
    }

    const cookieToken = this.extractCookieToken(res);
    const token =
      (typeof data.token === 'string' && data.token) ||
      (typeof data.sessionToken === 'string' && data.sessionToken) ||
      cookieToken;

    if (token) {
      await this.secrets.store(SECRET_CLOUD_TOKEN, token);
    }

    let user: CloudUser | null = (data.user as CloudUser | undefined) ?? null;
    if (!user) {
      try {
        user = await this.fetchMe();
      } catch {
        user = { id: 'cloud_user', email, plan: 'free', emailVerified: true };
      }
    }

    await this.memento.update(STATE_CLOUD_USER, user);
    const databases = await this.listDatabases();
    this._onDidChange.fire();
    return { user, databases };
  }

  public async logout(): Promise<void> {
    try {
      const headers = await this.buildHeaders();
      await fetch(`${this.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers,
      }).catch(() => undefined);
    } finally {
      await this.secrets.delete(SECRET_CLOUD_TOKEN);
      await this.memento.update(STATE_CLOUD_USER, null);
      this._onDidChange.fire();
    }
  }

  public async fetchMe(): Promise<CloudUser> {
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/api/auth/me`, {
      method: 'GET',
      headers,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.user) {
      throw new Error((data.error as string) || `Session validation failed (HTTP ${res.status})`);
    }
    const user = data.user as CloudUser;
    await this.memento.update(STATE_CLOUD_USER, user);
    return user;
  }

  public async listDatabases(): Promise<CloudDatabase[]> {
    const token = await this.getSessionToken();
    if (!token) {
      return [];
    }
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/api/databases`, {
      method: 'GET',
      headers,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (res.status === 401) {
        await this.secrets.delete(SECRET_CLOUD_TOKEN);
        await this.memento.update(STATE_CLOUD_USER, null);
      }
      throw new Error((data.error as string) || `Failed to fetch cloud servers (HTTP ${res.status})`);
    }

    const list = Array.isArray(data.databases) ? (data.databases as CloudDatabase[]) : [];

    // Enrich with per-database detail (plan_expires_at, stats) when list size is small
    if (list.length > 0 && list.length <= 8) {
      const enriched = await Promise.all(
        list.map(async (db) => {
          try {
            const detail = await this.getDatabaseDetail(db.id);
            return detail ? { ...db, ...detail } : db;
          } catch {
            return db;
          }
        })
      );
      return enriched;
    }

    return list;
  }

  public async getDatabaseDetail(dbId: string): Promise<CloudDatabase | null> {
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/api/databases/${encodeURIComponent(dbId)}`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return (data.database as CloudDatabase | undefined) ?? null;
  }

  /**
   * Public Zero-Install Temporary Database Provisioning (`POST /api/auth/register-fast`).
   * Does NOT require any user information: if `req` or its fields are omitted,
   * anonymous parameters are generated automatically.
   */
  public async registerFast(req?: Partial<FastRegisterRequest>): Promise<FastRegisterResponse> {
    const autoParams = generateAnonymousFastRegisterParams();
    const email = req?.email?.trim() ? req.email.trim().toLowerCase() : autoParams.email;
    const cleanDbName = req?.dbName?.trim() ? req.dbName.trim() : autoParams.dbName;
    const subdomain = req?.subdomain?.trim()
      ? req.subdomain.trim().toLowerCase()
      : autoParams.subdomain;

    const emailCheck = validateFastRegisterEmail(email);
    if (!emailCheck.valid) {
      throw new Error(emailCheck.error);
    }

    const subdomainCheck = validateSubdomain(subdomain);
    if (!subdomainCheck.valid) {
      throw new Error(subdomainCheck.error);
    }

    if (cleanDbName.length < 2) {
      throw new Error('Database name must be at least 2 characters.');
    }

    const payload: FastRegisterRequest = {
      email,
      dbName: cleanDbName,
      subdomain,
    };

    const res = await fetch(`${this.baseUrl}/api/auth/register-fast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errMsg =
        (data.error as string) ||
        (data.message as string) ||
        `Temporary database provisioning failed (HTTP ${res.status}).`;
      throw new Error(errMsg);
    }

    const cookieToken = this.extractCookieToken(res);
    const token =
      (typeof data.token === 'string' && data.token) ||
      cookieToken ||
      '';

    const existingToken = await this.getSessionToken();
    if (token && !existingToken) {
      await this.secrets.store(SECRET_CLOUD_TOKEN, token);
    }

    const nowIso = new Date().toISOString();
    const oneHourLaterIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const rawDb = (data.database as Partial<CloudDatabase> | undefined) ?? {};
    const database: CloudDatabase = {
      id: rawDb.id || `temp_${Date.now()}`,
      name: rawDb.name || cleanDbName,
      subdomain: rawDb.subdomain || payload.subdomain,
      plan: rawDb.plan || 'free',
      status: rawDb.status || 'active',
      is_accessible: rawDb.is_accessible ?? true,
      is_expired: rawDb.is_expired ?? false,
      disk_limit_mb: rawDb.disk_limit_mb ?? 50,
      daily_request_limit: rawDb.daily_request_limit ?? 10000,
      created_at: rawDb.created_at || nowIso,
      expires_at: rawDb.expires_at || rawDb.plan_expires_at || oneHourLaterIso,
      plan_expires_at: rawDb.plan_expires_at || rawDb.expires_at || oneHourLaterIso,
    };

    const user: CloudUser = (data.user as CloudUser | undefined) ?? {
      id: 'temp_user',
      email: payload.email,
      plan: 'free',
      emailVerified: false,
    };

    const apiKey = typeof data.apiKey === 'string' ? data.apiKey : '';
    if (apiKey) {
      await this.storeApiKey(database.id, database.subdomain, apiKey);
    }

    const provisioned: CloudProvisionedSession = {
      dbId: database.id,
      dbName: database.name,
      subdomain: database.subdomain,
      apiKey,
      createdAt: database.created_at || nowIso,
      expiresAt: database.expires_at || oneHourLaterIso,
      verificationLink: typeof data.verificationLink === 'string' ? data.verificationLink : undefined,
    };

    if (!existingToken) {
      await this.memento.update(STATE_CLOUD_USER, user);
    }
    await this.memento.update(STATE_LAST_PROVISIONED, provisioned);
    this._onDidChange.fire();

    return {
      success: true,
      message: typeof data.message === 'string' ? data.message : 'Temporary cloud database created.',
      user,
      token,
      verificationLink: provisioned.verificationLink,
      database,
      apiKey,
    };
  }

  public async createDatabase(
    name: string,
    subdomain: string,
    plan: 'free' | 'paid' = 'free'
  ): Promise<{ database: CloudDatabase; initialApiKey?: string }> {
    const subCheck = validateSubdomain(subdomain);
    if (!subCheck.valid) {
      throw new Error(subCheck.error);
    }
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/api/databases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: name.trim(),
        subdomain: subdomain.trim().toLowerCase(),
        plan,
        terms_accepted: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((data.error as string) || `Failed to create database (HTTP ${res.status})`);
    }
    const database = data.database as CloudDatabase;
    const initialApiKey = typeof data.initialApiKey === 'string' ? data.initialApiKey : undefined;
    if (database && initialApiKey) {
      await this.storeApiKey(database.id, database.subdomain, initialApiKey);
    }
    this._onDidChange.fire();
    return { database, initialApiKey };
  }

  public async createApiKey(dbId: string, keyName: string = 'VSCode Extension'): Promise<string> {
    const headers = await this.buildHeaders();
    const res = await fetch(`${this.baseUrl}/api/databases/${encodeURIComponent(dbId)}/keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: keyName }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((data.error as string) || `Failed to create API Key (HTTP ${res.status})`);
    }
    const keyObj = data.key as Record<string, unknown> | undefined;
    const apiKey =
      (typeof keyObj?.apiKey === 'string' && keyObj.apiKey) ||
      (typeof data.apiKey === 'string' && data.apiKey) ||
      '';
    if (!apiKey) {
      throw new Error('No API Key returned from server.');
    }
    await this.storeApiKey(dbId, '', apiKey);
    return apiKey;
  }

  public async getState(): Promise<CloudState> {
    const token = await this.getSessionToken();
    const lastProvisioned = this.getLastProvisioned();
    if (!token) {
      return {
        isLoggedIn: false,
        user: null,
        databases: [],
        lastProvisioned,
      };
    }

    let user = this.getUser();
    try {
      user = await this.fetchMe();
    } catch {
      // Keep cached user if /me fails transiently
    }

    let databases: CloudDatabase[] = [];
    try {
      databases = await this.listDatabases();
    } catch (err) {
      Logger.warn(`Could not list cloud databases: ${String(err)}`);
    }

    // If token was invalidated by 401 in listDatabases
    const stillHasToken = Boolean(await this.getSessionToken());
    if (!stillHasToken) {
      return {
        isLoggedIn: false,
        user: null,
        databases: [],
        lastProvisioned,
      };
    }

    return {
      isLoggedIn: true,
      user,
      databases,
      lastProvisioned,
    };
  }

  /**
   * Adds or updates the Cloud database inside VS Code's ConnectionManager and connects to it.
   */
  public async connectDatabaseToExtension(
    target: {
      dbId: string;
      name: string;
      subdomain: string;
      apiKey?: string;
      expiresAt?: string;
      plan?: 'free' | 'paid';
    },
    connectionManager: IConnectionManager
  ): Promise<ServerConfig> {
    const url = `https://${target.subdomain}.axardb.com`;
    let apiKey = target.apiKey || (await this.getStoredApiKey(target.dbId, target.subdomain));

    if (!apiKey) {
      // Generate a fresh API key via Cloud API if logged in
      apiKey = await this.createApiKey(target.dbId, 'VSCode Extension Key');
      await this.storeApiKey(target.dbId, target.subdomain, apiKey);
    }

    const existing = connectionManager
      .list()
      .find((s) => s.url.toLowerCase() === url.toLowerCase());

    let serverConfig: ServerConfig;
    if (existing) {
      serverConfig = {
        ...existing,
        name: target.name,
        username: 'apikey',
        isCloud: true,
        subdomain: target.subdomain,
        expiresAt: target.expiresAt ?? existing.expiresAt,
        plan: target.plan ?? existing.plan,
      };
      await connectionManager.update(serverConfig, apiKey);
    } else {
      serverConfig = await connectionManager.add(
        {
          name: target.name,
          url,
          username: 'apikey',
          color: '#3b82f6',
          timeoutMs: 30000,
          isCloud: true,
          subdomain: target.subdomain,
          expiresAt: target.expiresAt,
          plan: target.plan,
        },
        apiKey
      );
    }

    try {
      await connectionManager.connect(serverConfig.id);
    } catch (err) {
      Logger.warn(`Cloud server added (${url}), initial ping warning: ${String(err)}`);
    }

    return serverConfig;
  }
}
