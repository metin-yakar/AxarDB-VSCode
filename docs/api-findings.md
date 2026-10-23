# AxarDB Server API Findings (Task S0)

> Reference Server: `C:\Github\AxarDB` (.NET 9 Minimal APIs + Jint)
> Verified against source: `Extensions/EndpointExtensions.cs`, `Middleware/BasicAuthenticationMiddleware.cs`, `Bridges/*`, `Core/ResultSet.cs`, `Core/DatabaseEngine.cs`.

---

## 1. Endpoints and HTTP Behavior

### 1.1 Authentication & Status Codes
- **Authentication**: Basic Authentication (`Authorization: Basic base64(user:pass)`).
- **Default Credentials**: Default root user is `unlocker:unlocker` (or registered users in `sysusers`).
- **401 Unauthorized**: Returns HTTP 401 with header `WWW-Authenticate: Basic realm="AxarDB"`.
- **404 Not Found**: For unknown routes or missing views.
- **500 / ProblemDetails**: If a script error occurs (e.g. syntax error or exception), returns ProblemDetails with `detail` containing the error message.

### 1.2 Endpoints Table
| Route | Method | Body / Params | Response Shape | Notes |
|:--|:--|:--|:--|:--|
| `/query` | `POST` | `text/plain` JS script; query params `?k=v` | JSON (return value of script) | Injects `@k` inside script safely |
| `/collections` | `GET` | None | `string[]` | Returns all DB, SYS collections and `syslogs` |
| `/collections/{name}` | `DELETE` | None | `{ "success": true }` | Drops collection from disk |
| `/memory/list` | `GET` | None | `[ { "name": string, "count": number } ]` | In-memory collections |
| `/bulk/list` | `GET` | None | `[ { "name": string, "file": string, "recordCount": number, "sizeKB": number } ]` | JSONL datasets |
| `/metrics` | `GET` | None | Snapshot object with memory & disk | Healthcheck & stats |
| `/views/{name}` | `GET` | Query params | JSON | Executes server-side view |
| `/views/{name}` | `DELETE` | None | `{ "success": true }` | Deletes view file |
| `/triggers/{name}` | `DELETE` | None | `{ "success": true }` | Deletes trigger file |

---

## 2. Query Language & Return Shapes

### 2.1 Reading Data
- `db.<col>.findall(predicate)`:
  - Returns a `ResultSet` implementing `IEnumerable<Dictionary<string, object>>`.
  - Serializes directly to a JSON array `[...]` upon HTTP response; **no `.toList()` required**.
  - Chainable with `.skip(n).take(m).orderBy(x => x.f).orderByDesc(x => x.f)`.
- `db.<col>.find(predicate)`:
  - Returns single object `{ ... }` or `null` if not found.
- `db.<col>.count()`:
  - Returns number (integer).

### 2.2 Writing Data
- `db.<col>.insert(doc)`:
  - If `_id` is omitted, server generates RFC 9562 UUID v7 (`guidv7()`).
  - Returns inserted object with `_id`.
- `db.<col>.update(predicate, patch)`:
  - Updates matched documents.
  - Returns void (in Jint -> null / empty response).
- `db.<col>.delete(predicate)`:
  - Deletes matched documents.
  - Returns void.

### 2.3 Parameter Injection Safety (`@param`)
- Query string parameters on `/query?name=Alice&minAge=20` are injected as `@name` and `@minAge`.
- Jint script parser replaces `@placeholder` with properly typed values, preventing script injection.

---

## 3. Categories & Classification

AxarDB's `GetCollections()` returns a unified list combining regular collections, `sys*` collections, and `syslogs`.
The extension classifies items into 7 distinct accordion categories:

1. **DB**: collections from `GET /collections` not starting with `sys`.
2. **SYS**: collections starting with `sys`, excluding `syslogs` (`sysusers`, `sysqueue`, `sysvaults`, `sysconfig`).
3. **LOG**: `syslogs` virtual collection from `GET /collections`.
4. **MEMORY**: collections from `GET /memory/list`.
5. **BULK**: collections from `GET /bulk/list`.
6. **VIEW**: scripts listed by `POST /query` with `db.listViews()`.
7. **TRIGGER**: scripts listed by `POST /query` with `db.listTriggers()`.

---

## 4. System Logs & Backup

- `db.syslogs`: Read-only virtual collection aggregating request, error, and debug logs.
  - Fields: `_id` (UUID v7), `timestamp`, `type` (`"request" | "error" | "debug"`), `ip`, `user`, `query`, `durationMs`, `status`.
- `log.request`, `log.error`, `log.debug`, `log.queue`, `log.view`, `log.trigger`: Read from respective `*_logs` directories.
- `log.backup`: AxarDB server writes reverse queries to `backup_queries/YYYY-MM-DD.txt`, but `LogCollectionBridge` looks for `backup_logs`. Therefore, `log.backup` currently yields empty on unpatched servers (addressed in Task A8).

---

## 5. Contract Conformance

All findings are 100% compatible with the frozen contracts in `src/contracts/types.ts`, `messages.ts`, and `services.ts`. No breaking changes required.
