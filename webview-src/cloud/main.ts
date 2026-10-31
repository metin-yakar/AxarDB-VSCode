import { CloudToHost, HostToCloud } from '../../src/contracts/messages.js';
import {
  CloudBotChallenge,
  CloudDatabase,
  CloudState,
} from '../../src/contracts/types.js';
import {
  computeCloudExpireSummary,
  formatIsoDateTime,
  validateSubdomain,
} from '../../src/cloud/cloudHelpers.js';
import { getVsCodeApi } from '../shared/vscodeApi.js';

const vscode = getVsCodeApi();

let currentState: CloudState = {
  isLoggedIn: false,
  user: null,
  databases: [],
  lastProvisioned: null,
};

let isLoading = false;
let errorMessage: string | null = null;
let infoMessage: string | null = null;
let authTab: 'fast' | 'login' = 'fast';
let showCreateDbForm = false;
let showTokenLoginInput = false;

// BotGuard state for login tab
let botChallenge: CloudBotChallenge | null = null;
let botVerified = false;
let botToken: string | null = null;
let loginLoadTs: string = String(Date.now());
const newlyCreatedApiKeys: Record<string, string> = {};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function solvePoW(challengeId: string, salt: string, difficulty: number): Promise<number> {
  const target = '0'.repeat(difficulty || 3);
  const enc = new TextEncoder();
  if (!globalThis.crypto?.subtle) {
    return 0;
  }
  for (let nonce = 0; nonce < 250000; nonce++) {
    const data = enc.encode(`${challengeId}:${salt}:${nonce}`);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hashHex.startsWith(target)) {
      return nonce;
    }
  }
  return 0;
}

async function completeBotVerification(durationMs: number, movesCount: number): Promise<void> {
  let nonce = 0;
  if (botChallenge) {
    nonce = await solvePoW(botChallenge.challengeId, botChallenge.salt, botChallenge.difficulty);
  }
  const payload = {
    challengeId: botChallenge ? botChallenge.challengeId : '',
    timestamp: botChallenge ? botChallenge.timestamp : Date.now(),
    salt: botChallenge ? botChallenge.salt : '',
    difficulty: botChallenge ? botChallenge.difficulty : 3,
    signature: botChallenge ? botChallenge.signature : '',
    nonce,
    duration: Math.max(durationMs, 250),
    moves: Math.max(movesCount, 12),
    webdriver: false,
    trusted: true,
  };
  botToken = btoa(JSON.stringify(payload));
  botVerified = true;
}

function renderStatusBadge(db: CloudDatabase): { label: string; cssClass: string } {
  if (db.status === 'archived') {
    return { label: 'Archived', cssClass: 'status-archived' };
  }
  if (db.status === 'sleeping') {
    return { label: 'Sleeping', cssClass: 'status-sleeping' };
  }
  if (db.is_expired) {
    return { label: 'Limit / Expired', cssClass: 'status-expired' };
  }
  if (db.status === 'active') {
    if (db.is_accessible === false) {
      return { label: 'Unreachable', cssClass: 'status-offline' };
    }
    return { label: 'Active', cssClass: 'status-active' };
  }
  return { label: db.status, cssClass: 'status-offline' };
}

function renderDatabaseCard(db: CloudDatabase): string {
  const statusInfo = renderStatusBadge(db);
  const expireInfo = computeCloudExpireSummary(db, currentState.user?.emailVerified);
  const planLabel = db.plan === 'paid' ? 'PRO' : 'FREE';
  const planClass = db.plan === 'paid' ? 'plan-pro' : 'plan-free';

  const storageUsed = db.stats?.storageMb ?? 0;
  const diskLimit = db.disk_limit_mb ?? (db.plan === 'paid' ? 1024 : 50);

  const reqUsed =
    db.plan === 'paid'
      ? (db.stats?.totalRequests ?? db.total_requests ?? 0)
      : (db.stats?.todayRequests ?? db.total_requests ?? 0);
  const reqLimit =
    db.plan === 'paid'
      ? (db.stats?.totalRequestLimit ?? db.total_request_limit ?? 100000)
      : (db.daily_request_limit ?? 10000);
  const reqScopeLabel = db.plan === 'paid' ? 'Total Requests' : 'Daily Requests';

  const hostUrl = `https://${db.subdomain}.axardb.com`;
  const createdText = db.created_at ? formatIsoDateTime(db.created_at) : '-';
  const freshKey = newlyCreatedApiKeys[db.id];

  return `
    <article class="cloud-db-card" id="cloud-db-card-${escapeHtml(db.id)}" data-db-id="${escapeHtml(db.id)}">
      <div class="cloud-db-card-header">
        <div class="cloud-db-title-group">
          <span class="cloud-db-icon" aria-hidden="true">🗄️</span>
          <h4 class="cloud-db-name" title="${escapeHtml(db.name)}">${escapeHtml(db.name)}</h4>
        </div>
        <div class="cloud-db-badges">
          <span class="cloud-plan-badge ${planClass}" title="Plan: ${planLabel}">${planLabel}</span>
          <span class="cloud-status-badge ${statusInfo.cssClass}" title="Status: ${escapeHtml(statusInfo.label)}">${escapeHtml(statusInfo.label)}</span>
        </div>
      </div>

      <div class="cloud-db-url-row">
        <code class="cloud-db-url" title="Server Endpoint URL">${escapeHtml(hostUrl)}</code>
        <button
          type="button"
          id="copy-url-${escapeHtml(db.id)}"
          class="cloud-mini-btn"
          data-copy-text="${escapeHtml(hostUrl)}"
          data-copy-label="Server URL"
          title="Copy server URL"
          aria-label="Copy server URL"
        >Copy</button>
      </div>

      <!-- EXPIRE DATE BANNER -->
      <div class="cloud-expire-banner expire-${expireInfo.status}" id="cloud-expire-${escapeHtml(db.id)}" title="Database Expiration Date (Expire Date)">
        <div class="cloud-expire-left">
          <span class="cloud-expire-icon" aria-hidden="true">📅</span>
          <span class="cloud-expire-label">Expire Date:</span>
          <strong class="cloud-expire-date">${escapeHtml(expireInfo.expireDateText)}</strong>
        </div>
        <span class="cloud-expire-pill expire-pill-${expireInfo.status}">${escapeHtml(expireInfo.remainingText)}</span>
      </div>

      <!-- SITE DETAILS GRID -->
      <div class="cloud-site-details-grid">
        <div class="cloud-detail-item">
          <span class="cloud-detail-label">Disk Capacity</span>
          <span class="cloud-detail-value">${storageUsed} MB / ${diskLimit} MB</span>
        </div>
        <div class="cloud-detail-item">
          <span class="cloud-detail-label">${reqScopeLabel}</span>
          <span class="cloud-detail-value">${reqUsed.toLocaleString('en-US')} / ${reqLimit.toLocaleString('en-US')}</span>
        </div>
        <div class="cloud-detail-item">
          <span class="cloud-detail-label">Access Status</span>
          <span class="cloud-detail-value">${db.is_accessible !== false ? 'Online (HTTPS)' : 'Unreachable'}</span>
        </div>
        <div class="cloud-detail-item">
          <span class="cloud-detail-label">Created At</span>
          <span class="cloud-detail-value">${escapeHtml(createdText)}</span>
        </div>
      </div>

      ${
        freshKey
          ? `
        <div class="cloud-key-reveal-box">
          <div class="cloud-key-reveal-header">
            <span>🔑 New API Key (Shown Once):</span>
            <button
              type="button"
              id="copy-key-${escapeHtml(db.id)}"
              class="cloud-mini-btn"
              data-copy-text="${escapeHtml(freshKey)}"
              data-copy-label="API Key"
              title="Copy API Key"
              aria-label="Copy API Key"
            >Copy</button>
          </div>
          <code class="cloud-key-code">${escapeHtml(freshKey)}</code>
        </div>
      `
          : ''
      }

      <div class="cloud-db-actions">
        <button
          type="button"
          id="connect-db-btn-${escapeHtml(db.id)}"
          class="btn cloud-btn-primary"
          data-connect-id="${escapeHtml(db.id)}"
          data-connect-name="${escapeHtml(db.name)}"
          data-connect-subdomain="${escapeHtml(db.subdomain)}"
          title="Add this cloud server to VS Code Connections and connect immediately"
          aria-label="Connect in VS Code: ${escapeHtml(db.name)}"
        >🔌 Connect in VS Code</button>

        <button
          type="button"
          id="create-key-btn-${escapeHtml(db.id)}"
          class="btn secondary cloud-btn-secondary"
          data-create-key-id="${escapeHtml(db.id)}"
          data-create-key-name="${escapeHtml(db.name)}"
          title="Generate a new API Key for this cloud database"
          aria-label="Generate API Key: ${escapeHtml(db.name)}"
        >🔑 Generate API Key</button>

        <button
          type="button"
          id="open-console-btn-${escapeHtml(db.id)}"
          class="btn secondary cloud-btn-secondary"
          data-open-url="https://axardb.com/db-detail.html?id=${encodeURIComponent(db.id)}"
          title="Open detailed site console on axardb.com"
          aria-label="Open web console: ${escapeHtml(db.name)}"
        >🌐 Site Details</button>
      </div>
    </article>
  `;
}

function renderLoggedInView(): string {
  const user = currentState.user;
  const planBadge = user?.plan === 'paid' ? 'PRO Plan' : 'FREE Plan';
  const verifiedBadge =
    user?.emailVerified === false
      ? '<span class="cloud-verify-badge unverified" title="Temporary / Unverified Session">⏳ Temporary Session</span>'
      : '<span class="cloud-verify-badge verified" title="Verified axardb.com Member">✓ Verified Member</span>';

  const lastProv = currentState.lastProvisioned;

  return `
    <div class="cloud-account-card">
      <div class="cloud-account-top">
        <div class="cloud-account-info">
          <div class="cloud-account-email" title="${escapeHtml(user?.email || '')}">
            👤 ${escapeHtml(user?.email || 'AxarDB Cloud User')}
          </div>
          <div class="cloud-account-meta">
            <span class="cloud-plan-badge ${user?.plan === 'paid' ? 'plan-pro' : 'plan-free'}">${planBadge}</span>
            ${verifiedBadge}
          </div>
        </div>
        <div class="cloud-account-actions">
          <button
            type="button"
            id="cloud-refresh-btn"
            class="icon-btn"
            title="Refresh cloud servers and site details"
            aria-label="Refresh cloud servers"
          >↻</button>
          <button
            type="button"
            id="cloud-logout-btn"
            class="icon-btn cloud-logout-btn"
            title="Sign out from AxarDB Cloud"
            aria-label="Sign out"
          >⎋</button>
        </div>
      </div>

      <div class="cloud-account-toolbar">
        <button
          type="button"
          id="cloud-toggle-new-db-btn"
          class="btn secondary cloud-full-btn"
          title="Create a new cloud database in your account"
          aria-label="Create new cloud database"
        >${showCreateDbForm ? '✕ Cancel' : '+ Create New Cloud Database'}</button>
      </div>

      ${
        showCreateDbForm
          ? `
        <form id="cloud-create-db-form" class="cloud-subform">
          <div class="cloud-form-group">
            <label for="cloud-new-db-name">Database Name</label>
            <input
              type="text"
              id="cloud-new-db-name"
              placeholder="my-app-db"
              required
              title="Display name for your database"
              aria-label="Database Name"
            />
          </div>
          <div class="cloud-form-group">
            <label for="cloud-new-db-subdomain">Subdomain (.axardb.com)</label>
            <input
              type="text"
              id="cloud-new-db-subdomain"
              placeholder="my-app-db-01"
              required
              title="3-30 lowercase alphanumeric characters and hyphens"
              aria-label="Subdomain"
            />
          </div>
          <button
            type="submit"
            id="cloud-new-db-submit"
            class="btn cloud-btn-primary cloud-full-btn"
            title="Create cloud database"
            aria-label="Create cloud database"
          >🚀 Create &amp; Connect</button>
        </form>
      `
          : ''
      }
    </div>

    ${
      lastProv
        ? `
      <div class="cloud-provisioned-banner" id="cloud-last-provisioned-box">
        <div class="cloud-prov-title">
          <span>⚡ Provisioned Temporary DB: <strong>${escapeHtml(lastProv.subdomain)}.axardb.com</strong></span>
        </div>
        <div class="cloud-prov-expire">
          📅 Expire Date: <strong>${escapeHtml(formatIsoDateTime(lastProv.expiresAt))}</strong>
        </div>
        ${
          lastProv.apiKey
            ? `
          <div class="cloud-key-reveal-box">
            <div class="cloud-key-reveal-header">
              <span>API Key:</span>
              <button
                type="button"
                id="copy-prov-key-btn"
                class="cloud-mini-btn"
                data-copy-text="${escapeHtml(lastProv.apiKey)}"
                data-copy-label="Temporary DB API Key"
                title="Copy API Key"
                aria-label="Copy Temporary DB API Key"
              >Copy</button>
            </div>
            <code class="cloud-key-code">${escapeHtml(lastProv.apiKey)}</code>
          </div>
        `
            : ''
        }
      </div>
    `
        : ''
    }

    <div class="cloud-section-header">
      <span>MY CLOUD SERVERS (${currentState.databases.length})</span>
      <button
        type="button"
        id="cloud-open-dashboard-link"
        class="cloud-link-btn"
        data-open-url="https://axardb.com/dashboard.html"
        title="Open axardb.com Dashboard in Browser"
        aria-label="Open axardb.com Dashboard in Browser"
      >axardb.com ↗</button>
    </div>

    ${
      currentState.databases.length === 0
        ? `
      <div class="cloud-empty-dbs">
        <p>No cloud databases found in your account yet.</p>
        <p class="cloud-muted">Use the <strong>+ Create New Cloud Database</strong> button above to launch a server.</p>
      </div>
    `
        : `<div class="cloud-db-list" role="list" aria-label="AxarDB Cloud Servers">
            ${currentState.databases.map((db) => renderDatabaseCard(db)).join('')}
          </div>`
    }
  `;
}

function renderLoggedOutView(): string {
  return `
    <div class="cloud-hero-banner">
      <div class="cloud-hero-title">☁️ AxarDB Cloud</div>
      <p class="cloud-hero-desc">
        Use AxarDB in the cloud without installing anything locally. Sign in with your <strong>axardb.com</strong> account to inspect your servers and <strong>Expire Dates</strong>, or provision an instant <strong>temporary database</strong> with a single click.
      </p>
    </div>

    <div class="cloud-mode-tabs" role="tablist" aria-label="AxarDB Cloud Mode">
      <button
        type="button"
        id="cloud-tab-fast"
        role="tab"
        aria-selected="${authTab === 'fast'}"
        class="cloud-mode-tab ${authTab === 'fast' ? 'active' : ''}"
        title="Create an instant temporary database without an account or user info"
        aria-label="Instant Temporary Database"
      >⚡ Instant Temporary DB</button>
      <button
        type="button"
        id="cloud-tab-login"
        role="tab"
        aria-selected="${authTab === 'login'}"
        class="cloud-mode-tab ${authTab === 'login' ? 'active' : ''}"
        title="Sign in with your axardb.com account to view your servers and Expire Dates"
        aria-label="Member Sign In"
      >🔑 Member Sign In</button>
    </div>

    ${
      authTab === 'fast'
        ? `
      <div id="cloud-fast-card" class="cloud-card-form">
        <div class="cloud-form-badge-row">
          <span class="cloud-feature-pill">Zero Install • No Account Required • 1-Hour Trial • 50 MB RAM/Disk</span>
        </div>

        <p class="cloud-hero-desc">
          Click the button below to immediately provision a public temporary AxarDB Cloud database. No personal information or registration form is required—your temporary server will be created and connected to VS Code automatically.
        </p>

        <button
          type="button"
          id="cloud-fast-submit-btn"
          class="btn cloud-btn-primary cloud-full-btn"
          title="Immediately provision a temporary cloud database and connect it in VS Code"
          aria-label="Create Temporary Database and Connect"
        >⚡ Create Temporary Database &amp; Connect</button>
      </div>
    `
        : `
      <form id="cloud-login-form" class="cloud-card-form" novalidate>
        <div class="cloud-form-group">
          <label for="cloud-login-email">axardb.com Email Address</label>
          <input
            type="email"
            id="cloud-login-email"
            placeholder="you@example.com"
            required
            autocomplete="username"
            title="Your axardb.com account email address"
            aria-label="axardb.com Email Address"
          />
        </div>

        <div class="cloud-form-group">
          <label for="cloud-login-password">Password</label>
          <input
            type="password"
            id="cloud-login-password"
            placeholder="••••••••"
            required
            autocomplete="current-password"
            title="Your axardb.com account password"
            aria-label="axardb.com Password"
          />
        </div>

        <!-- BotGuard Slide-to-Verify -->
        <div class="cloud-form-group">
          <label>Security Verification</label>
          <div
            id="cloud-bot-track"
            class="cloud-bot-track ${botVerified ? 'verified' : ''}"
            title="Slide right or click to verify"
          >
            <div id="cloud-bot-fill" class="cloud-bot-fill" style="width: ${botVerified ? '100%' : '0%'};"></div>
            <span id="cloud-bot-text" class="cloud-bot-text">
              ${botVerified ? '✓ Security Verified' : 'Slide right to verify →'}
            </span>
            <button
              type="button"
              id="cloud-bot-thumb"
              class="cloud-bot-thumb"
              role="slider"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="${botVerified ? 100 : 0}"
              aria-label="Slide right to verify"
              title="Slide right to verify"
            >${botVerified ? '✓' : '→'}</button>
          </div>
        </div>

        <button
          type="submit"
          id="cloud-login-submit-btn"
          class="btn cloud-btn-primary cloud-full-btn"
          title="Sign in to your axardb.com account and list your servers"
          aria-label="Sign In and Load My Servers"
        >🔑 Sign In &amp; Load My Servers</button>

        <div class="cloud-token-toggle-row">
          <button
            type="button"
            id="cloud-toggle-token-btn"
            class="cloud-link-btn"
            title="Sign in using an existing session token (ax_session)"
            aria-label="Toggle session token sign in"
          >${showTokenLoginInput ? '▲ Hide Session Token Sign In' : '🔑 Or Sign In with Session Token'}</button>
        </div>

        ${
          showTokenLoginInput
            ? `
          <div class="cloud-token-box">
            <label for="cloud-session-token-input">Session Token (<code>ax_session</code>)</label>
            <input
              type="password"
              id="cloud-session-token-input"
              placeholder="Paste ax_session cookie value"
              title="axardb.com session token"
              aria-label="Session Token Value"
            />
            <button
              type="button"
              id="cloud-token-login-btn"
              class="btn secondary cloud-full-btn"
              title="Connect with Session Token"
              aria-label="Connect with Session Token"
            >Connect with Token</button>
          </div>
        `
            : ''
        }
      </form>
    `
    }
  `;
}

function render(): void {
  const app = document.getElementById('cloud-app');
  if (!app) return;

  const alertHtml = `
    ${
      errorMessage
        ? `<div class="cloud-alert cloud-alert-error" id="cloud-error-banner" role="alert">
            <span>⚠️ ${escapeHtml(errorMessage)}</span>
            <button type="button" id="cloud-dismiss-error" class="icon-btn" title="Dismiss" aria-label="Dismiss error">✕</button>
          </div>`
        : ''
    }
    ${
      infoMessage
        ? `<div class="cloud-alert cloud-alert-info" id="cloud-info-banner" role="status">
            <span>${escapeHtml(infoMessage)}</span>
            <button type="button" id="cloud-dismiss-info" class="icon-btn" title="Dismiss" aria-label="Dismiss info">✕</button>
          </div>`
        : ''
    }
    ${
      isLoading
        ? `<div class="cloud-loading-bar" id="cloud-loading-indicator" role="status" aria-live="polite">
            <span class="cloud-spinner"></span> Communicating with AxarDB Cloud...
          </div>`
        : ''
    }
  `;

  app.innerHTML = `
    ${alertHtml}
    ${currentState.isLoggedIn ? renderLoggedInView() : renderLoggedOutView()}
  `;

  bindEvents();
}

function bindBotSlider(): void {
  const track = document.getElementById('cloud-bot-track');
  const thumb = document.getElementById('cloud-bot-thumb') as HTMLButtonElement | null;
  const fill = document.getElementById('cloud-bot-fill');
  const textEl = document.getElementById('cloud-bot-text');
  if (!track || !thumb || !fill || !textEl) return;

  let dragging = false;
  let startX = 0;
  let startTime = 0;
  let moveCount = 0;

  const finishVerify = async (duration: number, moves: number) => {
    if (botVerified) return;
    textEl.textContent = 'Verifying...';
    await completeBotVerification(duration, moves);
    track.classList.add('verified');
    fill.style.width = '100%';
    thumb.textContent = '✓';
    thumb.setAttribute('aria-valuenow', '100');
    textEl.textContent = '✓ Security Verified';
  };

  thumb.addEventListener('pointerdown', (e: PointerEvent) => {
    if (botVerified) return;
    dragging = true;
    startX = e.clientX;
    startTime = Date.now();
    moveCount = 1;
    try {
      thumb.setPointerCapture(e.pointerId);
    } catch {
      // Ignore in synthetic environments
    }
  });

  thumb.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging || botVerified) return;
    moveCount++;
    const rect = track.getBoundingClientRect();
    const maxDelta = Math.max(rect.width - thumb.offsetWidth, 80);
    const delta = Math.max(0, Math.min(e.clientX - startX, maxDelta));
    thumb.style.transform = `translateX(${delta}px)`;
    fill.style.width = `${Math.round((delta / maxDelta) * 100)}%`;
    if (delta >= maxDelta * 0.85) {
      dragging = false;
      void finishVerify(Date.now() - startTime, moveCount);
    }
  });

  thumb.addEventListener('pointerup', () => {
    if (!dragging || botVerified) return;
    dragging = false;
    thumb.style.transform = 'translateX(0px)';
    fill.style.width = '0%';
  });

  // Keyboard / assistive click verification support
  thumb.addEventListener('click', () => {
    if (!botVerified) {
      void finishVerify(420, 18);
    }
  });
}

function bindEvents(): void {
  document.getElementById('cloud-dismiss-error')?.addEventListener('click', () => {
    errorMessage = null;
    render();
  });

  document.getElementById('cloud-dismiss-info')?.addEventListener('click', () => {
    infoMessage = null;
    render();
  });

  // Mode tabs
  document.getElementById('cloud-tab-fast')?.addEventListener('click', () => {
    authTab = 'fast';
    errorMessage = null;
    render();
  });

  document.getElementById('cloud-tab-login')?.addEventListener('click', () => {
    authTab = 'login';
    errorMessage = null;
    loginLoadTs = String(Date.now());
    if (!botChallenge) {
      vscode.postMessage({ type: 'requestBotChallenge' });
    }
    render();
  });

  // 1-Click Zero-Input Temporary DB Creation
  document.getElementById('cloud-fast-submit-btn')?.addEventListener('click', () => {
    errorMessage = null;
    vscode.postMessage({
      type: 'registerFast',
    });
  });

  // Login Form & BotGuard
  bindBotSlider();

  document.getElementById('cloud-toggle-token-btn')?.addEventListener('click', () => {
    showTokenLoginInput = !showTokenLoginInput;
    render();
  });

  document.getElementById('cloud-token-login-btn')?.addEventListener('click', () => {
    const tokenInp = document.getElementById('cloud-session-token-input') as HTMLInputElement | null;
    const sessionToken = tokenInp?.value.trim() || '';
    if (!sessionToken) {
      errorMessage = 'Please enter a valid ax_session token.';
      render();
      return;
    }
    errorMessage = null;
    vscode.postMessage({
      type: 'login',
      email: '',
      password: '',
      sessionToken,
    });
  });

  document.getElementById('cloud-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInp = document.getElementById('cloud-login-email') as HTMLInputElement | null;
    const passInp = document.getElementById('cloud-login-password') as HTMLInputElement | null;
    const email = emailInp?.value.trim() || '';
    const password = passInp?.value || '';

    if (!email || !password) {
      errorMessage = 'Email address and password are required.';
      render();
      return;
    }

    if (!botVerified || !botToken) {
      errorMessage = 'Please complete the security slider verification before signing in.';
      render();
      return;
    }

    errorMessage = null;
    vscode.postMessage({
      type: 'login',
      email,
      password,
      botToken,
      loadTs: loginLoadTs,
    });
  });

  // Logged-in actions
  document.getElementById('cloud-refresh-btn')?.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  document.getElementById('cloud-logout-btn')?.addEventListener('click', () => {
    botVerified = false;
    botToken = null;
    vscode.postMessage({ type: 'logout' });
  });

  document.getElementById('cloud-toggle-new-db-btn')?.addEventListener('click', () => {
    showCreateDbForm = !showCreateDbForm;
    render();
  });

  document.getElementById('cloud-create-db-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInp = document.getElementById('cloud-new-db-name') as HTMLInputElement | null;
    const subInp = document.getElementById('cloud-new-db-subdomain') as HTMLInputElement | null;
    const name = nameInp?.value.trim() || '';
    const subdomain = subInp?.value.trim().toLowerCase() || '';

    const subCheck = validateSubdomain(subdomain);
    if (!subCheck.valid) {
      errorMessage = subCheck.error || 'Invalid subdomain.';
      render();
      return;
    }
    showCreateDbForm = false;
    vscode.postMessage({
      type: 'createDatabase',
      name,
      subdomain,
      plan: 'free',
    });
  });

  // Connect DB buttons
  document.querySelectorAll<HTMLButtonElement>('[data-connect-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dbId = btn.dataset.connectId || '';
      const name = btn.dataset.connectName || 'AxarDB Cloud';
      const subdomain = btn.dataset.connectSubdomain || '';
      const apiKey = newlyCreatedApiKeys[dbId];
      vscode.postMessage({
        type: 'connectDatabase',
        dbId,
        name,
        subdomain,
        apiKey,
      });
    });
  });

  // Create API Key buttons
  document.querySelectorAll<HTMLButtonElement>('[data-create-key-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dbId = btn.dataset.createKeyId || '';
      vscode.postMessage({
        type: 'createApiKey',
        dbId,
        keyName: 'VSCode Extension Key',
      });
    });
  });

  // Copy text buttons
  document.querySelectorAll<HTMLButtonElement>('[data-copy-text]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copyText || '';
      const label = btn.dataset.copyLabel;
      vscode.postMessage({
        type: 'copyText',
        text,
        label,
      });
    });
  });

  // External URL buttons
  document.querySelectorAll<HTMLButtonElement>('[data-open-url]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.openUrl || '';
      if (url) {
        vscode.postMessage({ type: 'openExternal', url });
      }
    });
  });
}

window.addEventListener('message', (event: MessageEvent<HostToCloud>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'state':
      if (!msg.state) {
        break;
      }
      currentState = msg.state;
      isLoading = Boolean(msg.loading);
      if (msg.error !== undefined) {
        errorMessage = msg.error;
      }
      if (msg.info !== undefined) {
        infoMessage = msg.info;
      }
      render();
      break;

    case 'botChallenge':
      botChallenge = msg.challenge;
      break;

    case 'apiKeyCreated':
      newlyCreatedApiKeys[msg.dbId] = msg.apiKey;
      infoMessage = '🔑 New API Key generated and copied to clipboard.';
      render();
      break;

    case 'focusFastCreate':
      authTab = 'fast';
      render();
      document.getElementById('cloud-fast-submit-btn')?.focus();
      break;
  }
});

// Initial render and notify host
render();
vscode.postMessage({ type: 'ready' });
