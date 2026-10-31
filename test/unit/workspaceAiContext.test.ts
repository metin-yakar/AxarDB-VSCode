import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionManager } from '../../src/connections/connectionManager.js';
import {
  AI_CONTEXT_FILENAME,
  GITIGNORE_FILENAME,
  WorkspaceAiContextService,
  ensureGitignoreHasContextFile,
} from '../../src/context/workspaceAiContextService.js';
import { IAxarClient } from '../../src/contracts/services.js';

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
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {},
      }),
    },
    workspace: {
      workspaceFolders: [],
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    },
  };
});

function createMockMemento() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue?: T): T =>
      (store.has(key) ? store.get(key) : defaultValue) as T,
    update: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
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

describe('WorkspaceAiContextService (.axardb-context.md & .gitignore integration)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'axardb-ai-ctx-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('appends .axardb-context.md to an existing .gitignore file idempotently', async () => {
    const gitignorePath = path.join(tempDir, GITIGNORE_FILENAME);
    await fs.writeFile(gitignorePath, 'node_modules/\ndist/\n', 'utf-8');

    const addedFirst = await ensureGitignoreHasContextFile(tempDir);
    expect(addedFirst).toBe(true);

    const contentAfterFirst = await fs.readFile(gitignorePath, 'utf-8');
    expect(contentAfterFirst).toContain(AI_CONTEXT_FILENAME);

    // Calling again should not duplicate the entry
    const addedSecond = await ensureGitignoreHasContextFile(tempDir);
    expect(addedSecond).toBe(false);
  });

  it('does not create a .gitignore file if the workspace does not have one', async () => {
    const added = await ensureGitignoreHasContextFile(tempDir);
    expect(added).toBe(false);

    await expect(fs.access(path.join(tempDir, GITIGNORE_FILENAME))).rejects.toThrow();
  });

  it('creates .axardb-context.md with credentials, collections, query guide & GitHub doc instructions on connect, and deletes it on disconnect', async () => {
    const gitignorePath = path.join(tempDir, GITIGNORE_FILENAME);
    await fs.writeFile(gitignorePath, 'node_modules/\n', 'utf-8');

    const memento = createMockMemento();
    const secrets = createMockSecrets();

    const mockClient: IAxarClient = {
      ping: vi.fn().mockResolvedValue({ ok: true, elapsedMs: 5 }),
      listCategories: vi.fn().mockResolvedValue([
        {
          kind: 'db',
          label: 'DATABASE',
          items: [
            { name: 'users', kind: 'db', count: 42 },
            { name: 'orders', kind: 'db', count: 128 },
          ],
        },
      ]),
      query: vi.fn(),
      dropCollection: vi.fn(),
    };

    const connManager = new ConnectionManager(
      memento as never,
      secrets as never,
      () => mockClient
    );

    const aiContextService = new WorkspaceAiContextService(
      connManager,
      (id) => connManager.getClient(id),
      () => [tempDir]
    );

    // Add a Cloud server and connect
    const srv = await connManager.add(
      {
        name: 'temp-db-0bu9vb',
        url: 'https://axar-tmp-0bu9vb-bt0f.axardb.com',
        username: 'apikey',
        isCloud: true,
        subdomain: 'axar-tmp-0bu9vb-bt0f',
        expiresAt: '2026-10-31 17:15',
        plan: 'free',
      },
      'axdb_mock_secret_token_999'
    );

    await connManager.connect(srv.id);
    await aiContextService.sync();

    // 1. Verify .gitignore was updated with .axardb-context.md
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('.axardb-context.md');

    // 2. Verify .axardb-context.md was created and contains all required AI guidance
    const contextFilePath = path.join(tempDir, AI_CONTEXT_FILENAME);
    const contextContent = await fs.readFile(contextFilePath, 'utf-8');

    expect(contextContent).toContain('CONFIDENTIAL — DO NOT COMMIT');
    expect(contextContent).toContain('temp-db-0bu9vb');
    expect(contextContent).toContain('https://axar-tmp-0bu9vb-bt0f.axardb.com');
    expect(contextContent).toContain('axdb_mock_secret_token_999');
    expect(contextContent).toContain('Bearer axdb_mock_secret_token_999');
    expect(contextContent).toContain('2026-10-31 17:15');
    expect(contextContent).toContain('`users` (42 docs)');
    expect(contextContent).toContain('`orders` (128 docs)');
    expect(contextContent).toContain('AxarDB is NOT MongoDB and NOT SQL');
    expect(contextContent).toContain('https://github.com/metin-yakar/AxarDB');
    expect(contextContent).toContain(
      'https://raw.githubusercontent.com/metin-yakar/AxarDB/main/Docs/llm_ragfile_en.md'
    );
    expect(contextContent).toContain('https://axardb.com/llms.txt');

    // 3. Disconnect the server -> .axardb-context.md should be automatically deleted
    connManager.disconnect(srv.id);
    await aiContextService.sync();

    await expect(fs.access(contextFilePath)).rejects.toThrow();

    aiContextService.dispose();
  });
});
