import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildAuthHeader } from '../client/axarClient.js';
import { IAxarClient, IConnectionManager } from '../contracts/services.js';
import { CategoryInfo, ServerConfig } from '../contracts/types.js';
import { Logger } from '../util/logger.js';

export const AI_CONTEXT_FILENAME = '.axardb-context.md';
export const GITIGNORE_FILENAME = '.gitignore';

export interface ConnectedServerContextEntry {
  server: ServerConfig;
  username: string;
  password: string;
  authHeader: string;
  isBearerApiKey: boolean;
  categories?: CategoryInfo[];
}

/**
 * Ensures that if a `.gitignore` file exists in `workspaceFolderPath`,
 * `.axardb-context.md` is listed in it so the confidential temporary context file
 * is never accidentally committed to a Git remote.
 */
export async function ensureGitignoreHasContextFile(
  workspaceFolderPath: string,
  contextFilename: string = AI_CONTEXT_FILENAME
): Promise<boolean> {
  const gitignorePath = path.join(workspaceFolderPath, GITIGNORE_FILENAME);

  let existingContent: string;
  try {
    existingContent = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // .gitignore does not exist in this workspace folder
    return false;
  }

  const lines = existingContent.split(/\r?\n/).map((line) => line.trim());
  const alreadyIgnored = lines.some(
    (line) =>
      line === contextFilename ||
      line === `/${contextFilename}` ||
      line === `**/${contextFilename}`
  );

  if (alreadyIgnored) {
    return false;
  }

  const lineEnding = existingContent.includes('\r\n') ? '\r\n' : '\n';
  const needsLeadingNewline =
    existingContent.length > 0 && !existingContent.endsWith('\n') && !existingContent.endsWith('\r');

  const addition =
    (needsLeadingNewline ? lineEnding : '') +
    `${lineEnding}# AxarDB AI IDE temporary connection context (contains credentials - DO NOT COMMIT)${lineEnding}` +
    `${contextFilename}${lineEnding}`;

  await fs.writeFile(gitignorePath, existingContent + addition, 'utf-8');
  Logger.info(`Added ${contextFilename} to ${gitignorePath}`);
  return true;
}

/**
 * Builds the Markdown content for `.axardb-context.md` so AI-assisted IDEs
 * (Antigravity, Cursor, Windsurf, GitHub Copilot, Claude Code, Cline, etc.)
 * automatically know that AxarDB is used, how to connect with the active credentials,
 * how to write valid AxarDB JavaScript queries, and where to fetch official GitHub docs.
 */
export function buildAiContextMarkdown(
  entries: ConnectedServerContextEntry[],
  generatedAtIso: string = new Date().toISOString()
): string {
  const lines: string[] = [];

  lines.push('# ⚠️ AxarDB Active Connection & AI IDE Context (CONFIDENTIAL — DO NOT COMMIT)');
  lines.push('');
  lines.push(
    '> **SECURITY & PRIVACY NOTICE**: This is a **temporary, auto-generated workspace file** created by the **AxarDB for VS Code** extension while an AxarDB server connection is active.'
  );
  lines.push(
    '> It contains live connection URLs, usernames, passwords, and/or API keys so AI-assisted IDEs can help you query, inspect, and build against your active AxarDB database.'
  );
  lines.push(
    '> **Never commit this file to Git or share it publicly.** It is automatically added to `.gitignore` (if present) and deleted when all servers disconnect.'
  );
  lines.push('');
  lines.push(`- **Generated / Updated At**: \`${generatedAtIso}\``);
  lines.push(`- **Active Connected Servers**: \`${entries.length}\``);
  lines.push('- **Database Engine**: **AxarDB** (High-Performance In-Memory & Persistent NoSQL Database on ASP.NET Core 8.0 with Server-Side Jint JavaScript Query Engine)');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Active AxarDB Server Connection(s)');
  lines.push('');

  entries.forEach((entry, idx) => {
    const { server, username, password, authHeader, isBearerApiKey, categories } = entry;
    const isCloud =
      Boolean(server.isCloud) ||
      server.url.toLowerCase().includes('.axardb.com') ||
      isBearerApiKey;

    lines.push(`### ${idx + 1}. ${server.name}`);
    lines.push('');
    lines.push('| Property | Value |');
    lines.push('|:---|:---|');
    lines.push(`| **Server ID** | \`${server.id}\` |`);
    lines.push(`| **Server Name** | \`${server.name}\` |`);
    lines.push(`| **Environment** | ${isCloud ? '☁️ AxarDB Cloud' : '🖥️ Local / Self-Hosted AxarDB'} |`);
    lines.push(`| **Base URL** | \`${server.url}\` |`);
    lines.push(`| **Query Endpoint** | \`POST ${server.url}/query\` |`);
    lines.push(`| **Collections Endpoint** | \`GET ${server.url}/collections\` |`);
    if (server.subdomain) {
      lines.push(`| **Cloud Subdomain** | \`${server.subdomain}.axardb.com\` |`);
    }
    if (server.plan) {
      lines.push(`| **Cloud Plan** | \`${server.plan.toUpperCase()}\` |`);
    }
    if (server.expiresAt) {
      lines.push(`| **Expire Date** | \`${server.expiresAt}\` |`);
    }
    lines.push(
      `| **Auth Type** | ${isBearerApiKey ? 'Bearer API Key (`Authorization: Bearer axdb_...`)' : 'HTTP Basic Auth (`Authorization: Basic ...`)'} |`
    );
    lines.push(`| **Username** | \`${username}\` |`);
    lines.push(`| **Password / API Key** | \`${password}\` |`);
    lines.push(`| **HTTP Authorization Header** | \`${authHeader}\` |`);
    lines.push('');

    // Discovered Collections & Categories
    if (categories && categories.length > 0) {
      lines.push(`#### Active Collections on \`${server.name}\``);
      lines.push('');
      let hasAnyItems = false;
      for (const cat of categories) {
        if (!cat.items || cat.items.length === 0) continue;
        hasAnyItems = true;
        const itemSummary = cat.items
          .map((item) =>
            item.count !== undefined ? `\`${item.name}\` (${item.count} docs)` : `\`${item.name}\``
          )
          .join(', ');
        lines.push(`- **${cat.label} (\`${cat.kind}\`)**: ${itemSummary}`);
      }
      if (!hasAnyItems) {
        lines.push(
          '- *No collections created yet. Note: AxarDB creates collections automatically on the first `.insert({...})` call.*'
        );
      }
      lines.push('');
    }

    // Ready-to-run Connection Examples for this Server
    lines.push(`#### How to Connect & Execute Queries on \`${server.name}\``);
    lines.push('');
    lines.push('**cURL Example:**');
    lines.push('```bash');
    if (isBearerApiKey) {
      lines.push(`curl -X POST "${server.url}/query" \\`);
      lines.push(`  -H "Authorization: ${authHeader}" \\`);
      lines.push(`  -H "Content-Type: text/plain; charset=utf-8" \\`);
      lines.push(`  -d "return db.users.findall();"`);
    } else {
      lines.push(`curl -X POST "${server.url}/query" \\`);
      lines.push(`  -u "${username}:${password}" \\`);
      lines.push(`  -H "Content-Type: text/plain; charset=utf-8" \\`);
      lines.push(`  -d "return db.users.findall();"`);
    }
    lines.push('```');
    lines.push('');

    lines.push('**JavaScript / TypeScript (`fetch`) Example:**');
    lines.push('```typescript');
    lines.push(`async function queryAxarDB(script: string, params?: Record<string, string | number>) {`);
    lines.push(`  const url = new URL("${server.url}/query");`);
    lines.push(`  if (params) {`);
    lines.push(`    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));`);
    lines.push(`  }`);
    lines.push(`  const res = await fetch(url.toString(), {`);
    lines.push(`    method: "POST",`);
    lines.push(`    headers: {`);
    lines.push(`      "Authorization": "${authHeader}",`);
    lines.push(`      "Content-Type": "text/plain; charset=utf-8",`);
    lines.push(`    },`);
    lines.push(`    body: script,`);
    lines.push(`  });`);
    lines.push(`  if (!res.ok) throw new Error(await res.text());`);
    lines.push(`  return await res.json();`);
    lines.push(`}`);
    lines.push('```');
    lines.push('');
  });

  lines.push('---');
  lines.push('');
  lines.push('## 2. Critical Rules for AI Assistants: How AxarDB Works');
  lines.push('');
  lines.push(
    '1. **AxarDB is NOT MongoDB and NOT SQL**: Never generate MongoDB query objects (such as `db.users.find({ age: { $gt: 18 } })` or `insertOne`). AxarDB executes **native JavaScript** on the server via the Jint engine.'
  );
  lines.push(
    '2. **Collections Auto-Create on First Write**: You do not need `CREATE TABLE` or `createCollection`. Calling `db.orders.insert({ ... })` creates `orders` automatically.'
  );
  lines.push(
    '3. **Safe Parameterized Queries (`@param`)**: Never concatenate untrusted user input into query strings. Pass parameters in the URL query string (`POST /query?minAge=18&role=admin`) and reference them with `@` inside JavaScript (`db.users.findall(u => u.age >= @minAge && u.role == @role)`).'
  );
  lines.push(
    '4. **UUID v7 Auto-ID (`_id`)**: Every inserted document automatically receives a time-ordered UUID v7 `_id` string unless provided.'
  );
  lines.push('');
  lines.push('### AxarDB JavaScript Query Cheat Sheet');
  lines.push('');
  lines.push('```javascript');
  lines.push('// 1. INSERT (Single or inside loops)');
  lines.push('db.users.insert({ name: "Alice", age: 28, role: "admin", active: true });');
  lines.push('');
  lines.push('// 2. READ SINGLE DOCUMENT');
  lines.push('var user = db.users.find(u => u.name == "Alice");');
  lines.push('var byId = db.users.find(u => u._id == @id);');
  lines.push('');
  lines.push('// 3. READ MULTIPLE DOCUMENTS & RESULTSET CHAINING');
  lines.push('var activeAdmins = db.users');
  lines.push('  .findall(u => u.active && u.age >= 18)');
  lines.push('  .orderByDesc(u => u.age)');
  lines.push('  .skip(0)');
  lines.push('  .take(25)');
  lines.push('  .select(u => ({ id: u._id, name: u.name, age: u.age }));');
  lines.push('return activeAdmins;');
  lines.push('');
  lines.push('// 4. UPDATE DOCUMENTS (Predicate + Partial Fields)');
  lines.push('db.users.update(u => u._id == @id, { age: 29, updatedAt: Date.now() });');
  lines.push('');
  lines.push('// 5. DELETE DOCUMENTS');
  lines.push('db.users.delete(u => u._id == @id);');
  lines.push('');
  lines.push('// 6. AGGREGATIONS & COUNTS');
  lines.push('var totalUsers = db.users.count(u => u.active);');
  lines.push('var roles = db.users.findall().distinct(u => u.role);');
  lines.push('var avgAge = db.users.findall().avg(u => u.age);');
  lines.push('var totalRevenue = db.orders.findall(o => o.paid).sum(o => o.amount);');
  lines.push('');
  lines.push('// 7. IN-MEMORY STORE (TTL Cache / Ephemeral Sessions)');
  lines.push('memory.sessions.insert({ token: "abc", userId: "u1" }).expire(3600); // expires in 3600s');
  lines.push('var sess = memory.sessions.find(s => s.token == @token);');
  lines.push('');
  lines.push('// 8. BULK STORE (High-Volume JSONL Datasets)');
  lines.push('bulk.events.insert([{ type: "click", ts: Date.now() }]);');
  lines.push('var recentEvents = bulk.events.findall(e => e.type == "click").take(100);');
  lines.push('');
  lines.push('// 9. TRANSACTIONS (Atomic Commit / Auto-Rollback on Error)');
  lines.push('db.beginTransaction();');
  lines.push('try {');
  lines.push('  db.accounts.update(a => a.id == "A", { balance: 900 });');
  lines.push('  db.accounts.update(a => a.id == "B", { balance: 1100 });');
  lines.push('  db.commit();');
  lines.push('} catch (e) {');
  lines.push('  db.rollback();');
  lines.push('  throw e;');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Instructions for AI IDE Tools: Fetching Complete Official Documentation');
  lines.push('');
  lines.push(
    'If your AI IDE assistant supports web/HTTP fetching, `curl`, or MCP tools (such as web fetch, GitHub file reader, or search tools) and has user permission, you can dynamically learn **all advanced AxarDB capabilities** (Indexing, Joins, Views `@access`, Triggers `@target`, CSV Engine, Schema Validation `valid`, Cryptography `crypto`, Pipelines `pipe`, GeoSpatial `geo`, AI/RAG Engine `ai` & `rag`, Blockchain Ledger `chain`, `.NET SDK`, `Python SDK`, and `CLI`) by reading these official sources:'
  );
  lines.push('');
  lines.push('1. **Official AxarDB AI / LLM Complete RAG Reference (Recommended Primary Doc for AI Models)**:');
  lines.push('   - **Raw Markdown URL**: https://raw.githubusercontent.com/metin-yakar/AxarDB/main/Docs/llm_ragfile_en.md');
  lines.push('   - **GitHub Page**: https://github.com/metin-yakar/AxarDB/blob/main/Docs/llm_ragfile_en.md');
  lines.push('2. **Official AxarDB GitHub Repository & READMEs**:');
  lines.push('   - **Repository**: https://github.com/metin-yakar/AxarDB');
  lines.push('   - **English README (Raw)**: https://raw.githubusercontent.com/metin-yakar/AxarDB/main/README.md');
  lines.push('   - **Turkish Documentation (Raw)**: https://raw.githubusercontent.com/metin-yakar/AxarDB/main/Docs/README.tr.md');
  lines.push('3. **AxarDB Cloud AI / LLM Specification & REST API Guide**:');
  lines.push('   - **Cloud LLM Spec**: https://axardb.com/llms.txt');
  lines.push('');

  return lines.join('\n');
}

/**
 * Manages the lifecycle of `.axardb-context.md` in the user's workspace folders
 * whenever servers connect, load collections, or disconnect.
 */
export class WorkspaceAiContextService implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _categoriesByServer = new Map<string, CategoryInfo[]>();
  private _syncChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly connectionManager: IConnectionManager,
    private readonly clientProvider: (serverId: string) => IAxarClient | undefined,
    private readonly customWorkspaceFoldersProvider?: () => string[]
  ) {
    this._disposables.push(
      this.connectionManager.onDidChange(() => {
        void this.sync();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.sync();
      })
    );
  }

  /**
   * Updates cached collection categories for a server and refreshes `.axardb-context.md`.
   */
  public updateServerCategories(serverId: string, categories: CategoryInfo[]): void {
    this._categoriesByServer.set(serverId, categories);
    void this.sync();
  }

  /**
   * Serializes sync operations so rapid state transitions never race on disk I/O.
   */
  public sync(): Promise<void> {
    this._syncChain = this._syncChain
      .then(() => this.performSync())
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.warn(`WorkspaceAiContextService sync warning: ${msg}`);
      });
    return this._syncChain;
  }

  private getWorkspaceFolderPaths(): string[] {
    if (this.customWorkspaceFoldersProvider) {
      return this.customWorkspaceFoldersProvider();
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return [];
    }
    return folders.map((f) => f.uri.fsPath);
  }

  private async performSync(): Promise<void> {
    const folderPaths = this.getWorkspaceFolderPaths();
    if (folderPaths.length === 0) {
      return;
    }

    const connectedServers = this.connectionManager
      .list()
      .filter((s) => this.connectionManager.state(s.id) === 'connected');

    if (connectedServers.length === 0) {
      await this.removeContextFiles(folderPaths);
      return;
    }

    const entries: ConnectedServerContextEntry[] = [];
    for (const server of connectedServers) {
      let username = server.username;
      let password = '';
      try {
        const creds = await this.connectionManager.getCredentials(server.id);
        username = creds.username;
        password = creds.password;
      } catch {
        // Proceed with empty password if secret lookup fails
      }

      // Fetch categories if not already cached
      let categories = this._categoriesByServer.get(server.id);
      if (!categories) {
        const client = this.clientProvider(server.id);
        if (client) {
          try {
            categories = await client.listCategories(server.id);
            this._categoriesByServer.set(server.id, categories);
          } catch {
            // Ignore collection listing errors during context generation
          }
        }
      }

      const trimmedPassword = password.trim();
      const isBearerApiKey =
        trimmedPassword.startsWith('axdb_') ||
        (username.toLowerCase() === 'apikey' && trimmedPassword.length > 0);
      const authHeader = buildAuthHeader({ username, password });

      entries.push({
        server,
        username,
        password,
        authHeader,
        isBearerApiKey,
        categories,
      });
    }

    const markdown = buildAiContextMarkdown(entries);

    for (const folderPath of folderPaths) {
      try {
        // 1. Ensure .gitignore (if present in the workspace folder) ignores .axardb-context.md
        await ensureGitignoreHasContextFile(folderPath, AI_CONTEXT_FILENAME);

        // 2. Write the temporary confidential AI context file
        const contextFilePath = path.join(folderPath, AI_CONTEXT_FILENAME);
        await fs.writeFile(contextFilePath, markdown, { encoding: 'utf-8', mode: 0o600 });
        Logger.info(`Updated AI context file at ${contextFilePath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        Logger.warn(`Failed to write ${AI_CONTEXT_FILENAME} in ${folderPath}: ${msg}`);
      }
    }
  }

  public async removeContextFiles(folderPaths: string[] = this.getWorkspaceFolderPaths()): Promise<void> {
    for (const folderPath of folderPaths) {
      const contextFilePath = path.join(folderPath, AI_CONTEXT_FILENAME);
      try {
        await fs.unlink(contextFilePath);
        Logger.info(`Removed temporary AI context file: ${contextFilePath}`);
      } catch {
        // File already removed or doesn't exist
      }
    }
  }

  public dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    void this.removeContextFiles();
  }
}
