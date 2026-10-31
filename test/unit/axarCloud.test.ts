// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AxarCloudService,
  computeCloudExpireSummary,
  generateAnonymousFastRegisterParams,
  validateFastRegisterEmail,
  validateSubdomain,
} from '../../src/cloud/axarCloudService.js';
import { buildAuthHeader, AxarClient } from '../../src/client/axarClient.js';
import { Commands } from '../../src/contracts/commands.js';
import { CloudDatabase } from '../../src/contracts/types.js';

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    public event = (listener: (e: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    public fire(data: T): void {
      for (const l of this.listeners) l(data);
    }
    public dispose(): void {
      this.listeners = [];
    }
  }
  return {
    EventEmitter,
  };
});

function createMockMemento() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue?: T): T =>
      (store.has(key) ? store.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined || value === null) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    },
    keys: () => Array.from(store.keys()),
  };
}

function createMockSecrets() {
  const secrets = new Map<string, string>();
  return {
    get: async (key: string): Promise<string | undefined> => secrets.get(key),
    store: async (key: string, value: string): Promise<void> => {
      secrets.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      secrets.delete(key);
    },
    onDidChange: () => ({ dispose: () => {} }),
  };
}

describe('AxarDB Cloud Service, Expire Date & Webview Integration', () => {
  const sentMessages: unknown[] = [];
  let webviewState: unknown = {};

  (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
    postMessage: (msg: unknown) => sentMessages.push(msg),
    getState: () => webviewState,
    setState: (st: unknown) => {
      webviewState = st;
    },
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    sentMessages.length = 0;
    webviewState = {};
  });

  it('registers cloud commands in Commands contract including CLOUD_OPEN', () => {
    expect(Commands.CLOUD_OPEN).toBe('axardb.cloud.open');
    expect(Commands.CLOUD_REFRESH).toBe('axardb.cloud.refresh');
    expect(Commands.CLOUD_FAST_CREATE).toBe('axardb.cloud.fastCreate');
    expect(Commands.CLOUD_LOGOUT).toBe('axardb.cloud.logout');
  });

  it('auto-generates anonymous fast-registration parameters without requiring user info', () => {
    const anon = generateAnonymousFastRegisterParams();
    expect(validateFastRegisterEmail(anon.email).valid).toBe(true);
    expect(validateSubdomain(anon.subdomain).valid).toBe(true);
    expect(anon.dbName.length).toBeGreaterThanOrEqual(2);
  });

  it('validates fast-registration emails and subdomains according to axardb.com policy', () => {
    expect(validateFastRegisterEmail('metinyakar@gmail.com').valid).toBe(true);
    expect(validateFastRegisterEmail('devuser2026@outlook.com').valid).toBe(true);
    expect(validateFastRegisterEmail('cloudtest@proton.me').valid).toBe(true);

    // Rejects dots in local part
    const dotRes = validateFastRegisterEmail('metin.yakar@gmail.com');
    expect(dotRes.valid).toBe(false);
    expect(dotRes.error).toContain('Dots (.)');

    // Rejects + aliases in local part
    const plusRes = validateFastRegisterEmail('metinyakar+test@gmail.com');
    expect(plusRes.valid).toBe(false);
    expect(plusRes.error).toContain('(+)');

    // Rejects unknown/disposable domains
    const domainRes = validateFastRegisterEmail('user@tempmail.xyz');
    expect(domainRes.valid).toBe(false);

    // Validates subdomain
    expect(validateSubdomain('my-cloud-db-01').valid).toBe(true);
    expect(validateSubdomain('ab').valid).toBe(false);
    expect(validateSubdomain('-bad-start').valid).toBe(false);
    expect(validateSubdomain('bad_underscore').valid).toBe(false);
  });

  it('computes Expire Date summary in English for PRO, unverified temporary trial, and FREE databases', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');

    // 1. Paid PRO DB with plan_expires_at 15 days in the future
    const proDb: CloudDatabase = {
      id: 'db-pro-1',
      name: 'Prod Cluster',
      subdomain: 'prod-cluster',
      status: 'active',
      plan: 'paid',
      plan_expires_at: '2026-11-15T12:00:00Z',
    };
    const proExp = computeCloudExpireSummary(proDb, true, now);
    expect(proExp.status).toBe('ok');
    expect(proExp.remainingText).toBe('15 days left');
    expect(proExp.expireDateText).toContain('2026-11-15');

    // 2. Unverified fast-register trial DB (1-hour window from created_at)
    const trialDb: CloudDatabase = {
      id: 'db-trial-1',
      name: 'Temp DB',
      subdomain: 'temp-db-01',
      status: 'active',
      plan: 'free',
      created_at: '2026-10-31T11:30:00Z',
    };
    const trialExp = computeCloudExpireSummary(trialDb, false, now);
    expect(trialExp.status).toBe('warning');
    expect(trialExp.remainingText).toBe('30 min left');

    // 3. Expired database
    const expiredDb: CloudDatabase = {
      id: 'db-exp-1',
      name: 'Old DB',
      subdomain: 'old-db',
      status: 'active',
      is_expired: true,
      plan: 'paid',
      plan_expires_at: '2026-10-01T00:00:00Z',
    };
    const expSum = computeCloudExpireSummary(expiredDb, true, now);
    expect(expSum.status).toBe('expired');
    expect(expSum.remainingText).toContain('Expired');
  });

  it('supports Bearer axdb_... API keys and unwraps Cloud { success, result } envelopes in AxarClient', async () => {
    expect(buildAuthHeader({ username: 'apikey', password: 'axdb_mock_test_key_12345' })).toBe(
      'Bearer axdb_mock_test_key_12345'
    );
    expect(buildAuthHeader({ username: 'admin', password: 'secret' })).toBe(
      'Basic ' + Buffer.from('admin:secret').toString('base64')
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          result: [{ _id: '1', name: 'Cloud Row' }],
          executionTimeMs: 4,
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new AxarClient(async () => ({
      url: 'https://demo-01.axardb.com',
      username: 'apikey',
      password: 'axdb_mock_demo123',
    }));

    const qRes = await client.query({
      serverId: 'srv_cloud',
      script: 'return db.users.findall();',
    });

    expect(qRes.ok).toBe(true);
    expect(qRes.docs).toEqual([{ _id: '1', name: 'Cloud Row' }]);
    const calledHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(calledHeaders.Authorization).toBe('Bearer axdb_mock_demo123');
  });

  it('provisions temporary database via zero-input registerFast() and lists servers via AxarCloudService', async () => {
    const memento = createMockMemento();
    const secrets = createMockSecrets();
    const service = new AxarCloudService(
      memento as never,
      secrets as never,
      'https://axardb.com'
    );

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/register-fast')) {
        const sentBody = JSON.parse(String(init?.body || '{}')) as {
          email: string;
          dbName: string;
          subdomain: string;
        };
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'set-cookie': 'ax_session=sess_fast_999; Path=/; HttpOnly' }),
          json: async () => ({
            success: true,
            message: 'Temporary database created.',
            user: { id: 'u_fast', email: sentBody.email, plan: 'free', emailVerified: false },
            token: 'sess_fast_999',
            database: {
              id: 'db_fast_1',
              name: sentBody.dbName,
              subdomain: sentBody.subdomain,
              plan: 'free',
              status: 'active',
            },
            apiKey: 'axdb_mock_fastkey_001',
          }),
        };
      }
      if (url.endsWith('/api/databases')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            databases: [
              {
                id: 'db_fast_1',
                name: 'my-temp-db',
                subdomain: 'my-temp-db-01',
                plan: 'paid',
                status: 'active',
                is_accessible: true,
                is_expired: false,
                disk_limit_mb: 1024,
                total_requests: 1420,
                total_request_limit: 100000,
                plan_expires_at: '2026-12-31T23:59:59Z',
                created_at: '2026-10-31T10:00:00Z',
              },
            ],
          }),
        };
      }
      if (url.includes('/api/databases/db_fast_1')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            database: {
              id: 'db_fast_1',
              name: 'my-temp-db',
              subdomain: 'my-temp-db-01',
              plan: 'paid',
              status: 'active',
              is_accessible: true,
              is_expired: false,
              disk_limit_mb: 1024,
              plan_expires_at: '2026-12-31T23:59:59Z',
              stats: {
                storageMb: 12.4,
                totalRequests: 1420,
                totalRequestLimit: 100000,
              },
            },
          }),
        };
      }
      if (url.endsWith('/api/auth/me')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            user: { id: 'u_fast', email: 'member@axardb.com', plan: 'paid', emailVerified: true },
          }),
        };
      }
      return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
    });

    vi.stubGlobal('fetch', fetchMock);

    // Call registerFast() with NO user input required
    const fastRes = await service.registerFast();

    expect(fastRes.success).toBe(true);
    expect(fastRes.apiKey).toBe('axdb_mock_fastkey_001');
    expect(await service.getSessionToken()).toBe('sess_fast_999');

    const state = await service.getState();
    expect(state.isLoggedIn).toBe(true);
    expect(state.databases.length).toBe(1);
    expect(state.databases[0]?.plan_expires_at).toBe('2026-12-31T23:59:59Z');
    expect(state.databases[0]?.stats?.storageMb).toBe(12.4);
  });

  it('renders English AxarDB Cloud Panel for zero-input temporary DB creation and member server listing with Expire Date', async () => {
    document.body.innerHTML = `<div id="cloud-app" class="cloud-container"></div>`;

    await import('../../webview-src/cloud/main.js');

    // 1. Initial ready message sent and 1-Click Instant Temporary DB card rendered with no user info inputs
    expect(sentMessages).toContainEqual({ type: 'ready' });
    expect(document.getElementById('cloud-fast-email')).toBeNull();
    const fastSubmitBtn = document.getElementById('cloud-fast-submit-btn') as HTMLButtonElement;
    expect(fastSubmitBtn).not.toBeNull();
    expect(fastSubmitBtn.textContent).toContain('Create Temporary Database');

    // Clicking the button immediately triggers 'registerFast' with zero user info needed
    fastSubmitBtn.click();
    expect(sentMessages).toContainEqual({ type: 'registerFast' });

    // 2. Switch to Member Sign In tab and verify BotGuard slider + login submission
    const loginTabBtn = document.getElementById('cloud-tab-login') as HTMLButtonElement;
    loginTabBtn.click();

    const loginEmail = document.getElementById('cloud-login-email') as HTMLInputElement;
    const loginPass = document.getElementById('cloud-login-password') as HTMLInputElement;
    expect(loginEmail).not.toBeNull();
    loginEmail.value = 'member@axardb.com';
    loginPass.value = 'SecretPass123!';

    const botThumb = document.getElementById('cloud-bot-thumb') as HTMLButtonElement;
    botThumb.click();
    await new Promise((r) => setTimeout(r, 30));

    const loginForm = document.getElementById('cloud-login-form') as HTMLFormElement;
    loginForm.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(
      sentMessages.some(
        (m) =>
          typeof m === 'object' &&
          m !== null &&
          (m as { type?: string; email?: string }).type === 'login' &&
          (m as { type?: string; email?: string }).email === 'member@axardb.com'
      )
    ).toBe(true);

    // 3. Simulate Host pushing logged-in state with Cloud servers & Expire Date
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'state',
          state: {
            isLoggedIn: true,
            user: {
              id: 'usr_1',
              email: 'member@axardb.com',
              plan: 'paid',
              emailVerified: true,
            },
            databases: [
              {
                id: 'srv_cloud_101',
                name: 'E-Commerce Prod',
                subdomain: 'ecommerce-prod',
                status: 'active',
                is_accessible: true,
                is_expired: false,
                plan: 'paid',
                plan_expires_at: '2026-12-15T18:30:00Z',
                disk_limit_mb: 1024,
                created_at: '2026-10-01T09:00:00Z',
                stats: {
                  storageMb: 48.5,
                  totalRequests: 12450,
                  totalRequestLimit: 100000,
                },
              },
            ],
            lastProvisioned: null,
          },
          info: 'Signed in!',
        },
      })
    );

    // Verify Server Card, Site Details & Prominent Expire Date banner
    const dbCard = document.getElementById('cloud-db-card-srv_cloud_101');
    expect(dbCard).not.toBeNull();
    expect(dbCard?.textContent).toContain('E-Commerce Prod');
    expect(dbCard?.textContent).toContain('https://ecommerce-prod.axardb.com');
    expect(dbCard?.textContent).toContain('48.5 MB / 1024 MB');

    const expireBanner = document.getElementById('cloud-expire-srv_cloud_101');
    expect(expireBanner).not.toBeNull();
    expect(expireBanner?.textContent).toContain('Expire Date:');
    expect(expireBanner?.textContent).toContain('2026-12-15');

    // Click "Connect in VS Code" button on the cloud server card
    const connectBtn = document.getElementById('connect-db-btn-srv_cloud_101') as HTMLButtonElement;
    expect(connectBtn).not.toBeNull();
    connectBtn.click();

    expect(sentMessages).toContainEqual({
      type: 'connectDatabase',
      dbId: 'srv_cloud_101',
      name: 'E-Commerce Prod',
      subdomain: 'ecommerce-prod',
      apiKey: undefined,
    });
  });

  it('renders sleek server card with CLOUD & Expire pills, host subtitle, and inline Refresh buttons in Connections tree', async () => {
    document.body.innerHTML = `
      <div id="app" class="tree-container">
        <div class="filter-bar">
          <div class="filter-input-wrapper">
            <input type="text" id="filter-input" />
            <button id="filter-clear" class="filter-clear-btn">✕</button>
          </div>
          <button id="refresh-all-btn" class="filter-refresh-btn" type="button">↻</button>
        </div>
        <div id="tree-root" class="tree-content" role="tree"></div>
        <div id="empty-state" class="empty-state" style="display: none;">
          <button id="empty-add-btn" class="primary-btn">+ Add Server</button>
          <button id="empty-cloud-btn" class="secondary-btn">☁️ AxarDB Cloud</button>
        </div>
      </div>
    `;

    await import('../../webview-src/connections/main.js');

    // Push a legacy formatted server name (like from the user's screenshot) + a structured cloud server
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'state',
          servers: [
            {
              id: 'srv_legacy_tmp',
              name: '☁️ temp-db-0bu9vb [Exp: 2026-10-31 17:15] (axar-tmp-0bu9vb-bt0f)',
              url: 'https://axar-tmp-0bu9vb-bt0f.axardb.com',
              color: '#3b82f6',
              state: 'connected',
              categories: [
                {
                  kind: 'db',
                  label: 'DATABASE',
                  items: [{ name: 'users', kind: 'db', count: 5 }],
                },
              ],
            },
          ],
        },
      })
    );

    const serverNode = document.querySelector('.server-node') as HTMLElement;
    expect(serverNode).not.toBeNull();

    // Status dot uses .status-connected class without inline background override
    const statusDot = serverNode.querySelector('.status-dot') as HTMLElement;
    expect(statusDot.classList.contains('status-connected')).toBe(true);
    expect(statusDot.style.backgroundColor).toBe('');

    // Clean displayName without raw brackets or parenthesized subdomain
    const label = serverNode.querySelector('.server-label') as HTMLElement;
    expect(label.textContent).toBe('temp-db-0bu9vb');

    // Structured pills for CLOUD and Expire time
    const cloudPill = serverNode.querySelector('.pill-cloud') as HTMLElement;
    expect(cloudPill).not.toBeNull();
    expect(cloudPill.textContent).toContain('CLOUD');

    const hostSub = serverNode.querySelector('.server-host-text') as HTMLElement;
    expect(hostSub.textContent).toBe('axar-tmp-0bu9vb-bt0f.axardb.com');

    // Inline server refresh button triggers refresh message
    const serverRefreshBtn = serverNode.querySelector('.tree-action-btn') as HTMLButtonElement;
    expect(serverRefreshBtn).not.toBeNull();
    serverRefreshBtn.click();
    expect(sentMessages).toContainEqual({ type: 'refresh', serverId: 'srv_legacy_tmp' });

    // Top-bar refresh-all button triggers global refresh
    const refreshAllBtn = document.getElementById('refresh-all-btn') as HTMLButtonElement;
    refreshAllBtn.click();
    expect(sentMessages).toContainEqual({ type: 'refresh' });
  });
});
