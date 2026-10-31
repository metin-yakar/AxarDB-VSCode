import {
  DocCategory,
  DocCategoryId,
  DocSearchFieldScope,
  DocTopic,
} from '../contracts/types.js';

export const AXAR_DOCS_CATALOG: readonly DocCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    description: 'Overview, architecture, and core capabilities of AxarDB.',
    topics: [
      {
        id: 'overview',
        categoryId: 'getting-started',
        title: 'Overview & Latest Updates',
        icon: '🏠',
        summary: 'High-performance NoSQL database server powered by a JavaScript-based query language (Jint on ASP.NET Core 8.0).',
        keywords: ['overview', 'introduction', 'jint', 'aspnet', 'nosql', 'in-memory', 'latest', 'updates', 'genel bakış'],
        paragraphs: [
          'AxarDB is an in-memory NoSQL database server that executes JavaScript queries directly on the server using the Jint engine, built on ASP.NET Core 8.0.',
          'Structure: Database (db, memory, bulk) -> Collections -> Documents (JSON objects). Collections are created lazily on the first write (insert) operation.',
        ],
        bullets: [
          'System Configuration (sysconfig): Manage memoryLimitPercentage, bulkStoreMaxCacheBytes, maxRecursionDepth, queryTimeoutMinutes, and queuePollIntervalSeconds.',
          'Sys-prefix Protection: Custom collections starting with "sys" are blocked; only sysusers, sysqueue, sysvaults, sysconfig, and syslogs are permitted.',
          'Bulk Query Memory Optimization: JSONL queries use chunked processing bounded by bulkStoreMaxCacheBytes.',
          'Multi-Language UTF-8 HTTP Encoding: Full UTF-8 support for query string parameters (Turkish, Arabic, Russian, Chinese, Japanese, etc.).',
          'UUID v7 as Default ID Scheme: RFC 9562 time-ordered _id generation across Standard, Memory, and Bulk collections.',
          'Multi-Engine Benchmark Tool (compare.py): Compares AxarDB against PostgreSQL, MariaDB, and MongoDB.',
        ],
        callouts: [
          {
            kind: 'info',
            title: 'JavaScript Queries (Not MongoDB)',
            text: 'AxarDB queries are native JavaScript arrow functions (e.g. db.users.findall(u => u.age > 18)), never MongoDB query objects.',
          },
        ],
      },
      {
        id: 'features',
        categoryId: 'getting-started',
        title: 'Core Features',
        icon: '⚡',
        summary: 'Collection-based storage, PLINQ lazy evaluation, Memory Store, Bulk Store, CSV Engine, Views, and Triggers.',
        keywords: ['features', 'plinq', 'cache', 'csv', 'lazy', 'ram', 'özellikler'],
        bullets: [
          'Collection Based: Automatic collection creation on first write.',
          'JavaScript Query: Full server-side JS execution with ResultSet chaining.',
          'High Performance: ConcurrentDictionary, PLINQ lazy evaluation, and strictly capped 40% RAM cache usage.',
          'Memory Store (TTL): Temporary RAM-only storage with automatic expiration for sessions and caches.',
          'Bulk Store (JSONL): High-performance static dataset storage with LRU caching and FileSystemWatcher auto-reload.',
          'CSV Engine: Bidirectional csv() converter between raw CSV strings and object arrays.',
          'Smart Indexing: ASC and DESC field indexes for rapid filtering and range scans.',
          'Multi-Collection Joins: Named alias() and indexed (j1, j2) join operations.',
          'Views & Triggers: Stored server-side scripts (@access public/private) and asynchronous file-change event handlers (@target).',
          'Fail-safe Data Recovery: Automatic reverse query generation in backup_queries/YYYY-MM-DD.txt.',
        ],
      },
    ],
  },
  {
    id: 'javascript-api',
    title: 'JavaScript API',
    icon: '📜',
    description: 'CRUD operations, ResultSet chains, Memory & Bulk stores, Joins, UUID v7, Indexes, and Prototype extensions.',
    topics: [
      {
        id: 'data-read',
        categoryId: 'javascript-api',
        title: 'Data Reading (find & findall)',
        icon: '🔍',
        summary: 'Query collections with find(), findall(), and chainable ResultSet methods (take, skip, select, orderBy, count, distinct).',
        keywords: ['find', 'findall', 'read', 'select', 'take', 'skip', 'orderBy', 'orderByDesc', 'count', 'distinct', 'first', 'min', 'max', 'toList', 'ResultSet', 'veri okuma', 'sorgu'],
        paragraphs: [
          'The db object is the primary entry point for persistent database collections. find(predicate) returns the first matching document (or null), while findall(predicate?) returns a chainable and iterable ResultSet.',
        ],
        tables: [
          {
            headers: ['Method', 'Description', 'Example'],
            rows: [
              ['.toList() / .ToList()', 'Optional — Convert ResultSet to JS array', 'db.users.findall().toList()'],
              ['.take(n)', 'Limit results to first N items', 'db.users.findall().take(10)'],
              ['.skip(n)', 'Skip the first N items', 'db.users.findall().skip(10).take(10)'],
              ['.select(fn)', 'Project/transform each document', 'db.users.findall().select(u => u.name)'],
              ['.orderBy(fn)', 'Sort results ascending', 'db.users.findall().orderBy(u => u.age)'],
              ['.orderByDesc(fn)', 'Sort results descending', 'db.users.findall().orderByDesc(u => u.age)'],
              ['.count(predicate?)', 'Total or conditional match count', 'db.users.findall().count(u => u.age > 18)'],
              ['.distinct(selector?)', 'Unique values or projected fields', 'db.users.findall().distinct(u => u.role)'],
              ['.first()', 'First matching document', 'db.users.findall().first()'],
              ['.max(fn) / .min(fn)', 'Maximum or minimum field value', 'db.users.findall().max(u => u.age)'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Reading, Filtering, Pagination & Sorting',
            language: 'javascript',
            runnable: true,
            code: `// Find a single record (returns first match or null)
var user = db.users.find(u => u.age > 18);

// List all matches (ResultSet)
var admins = db.users.findall(u => u.role == "admin");

// Check if an item is in an array (Contains logic)
var targetCats = [66, 69, 74];
var myCats = db.categories.findall(x => x.rowNumber != null && x.rowNumber.includes(targetCats));

// Pagination (skip and take) & Sorting
var page2 = db.users.findall().orderByDesc(u => u.age).skip(10).take(10);

// Aggregations
var totalAdults = db.users.findall().count(u => u.age > 18);
var roles = db.users.findall().distinct(u => u.role);
var maxAge = db.users.findall().max(u => u.age);`,
          },
        ],
        callouts: [
          {
            kind: 'info',
            title: 'ResultSet Iteration',
            text: 'findall() returns a ResultSet that supports method chaining and direct JS iteration. Calling .toList() is optional.',
          },
        ],
      },
      {
        id: 'data-write',
        categoryId: 'javascript-api',
        title: 'Data Writing (insert, update, delete)',
        icon: '✏️',
        summary: 'Insert documents with auto UUID v7 _id, update records directly or via ResultSet chain, and delete records or collections.',
        keywords: ['insert', 'update', 'delete', 'deleteCollection', 'foreach', 'write', 'crud', 'veri yazma', 'ekleme', 'silme', 'güncelleme'],
        paragraphs: [
          'Use insert(doc) to add documents (automatically generating an RFC 9562 UUID v7 _id if omitted). Updates and deletions can be performed directly on the collection or chained onto a filtered ResultSet.',
        ],
        codeExamples: [
          {
            title: 'Insert, Update, Delete & Foreach',
            language: 'javascript',
            runnable: true,
            code: `// Insert a document (_id is generated automatically)
db.users.insert({
  name: "Ahmet",
  age: 25,
  role: "developer"
});

// Direct update by predicate
db.users.update(u => u.name == "Ahmet", { age: 26 });

// Update via ResultSet chain
db.users.findall(u => u.inactive == true).update({ status: "archived" });

// Delete matching documents
db.users.findall(u => u.inactive == true).delete();

// Drop entire collection (RAM + Disk)
db.deleteCollection("users");

// Iterate over records
db.users.findall().foreach(u => {
  console.log(u.name);
});`,
          },
        ],
      },
      {
        id: 'memory-store',
        categoryId: 'javascript-api',
        title: 'Memory Store (TTL)',
        icon: '🧠',
        summary: 'Transient, high-speed RAM-only storage with automatic Time-To-Live (TTL) expiration.',
        keywords: ['memory', 'ttl', 'cache', 'session', 'ram', 'temporary', 'bellek'],
        paragraphs: [
          'The top-level memory object works like db, but stores data exclusively in server RAM without disk writes. Each record has a TTL (in hours, default 1 hour) and is automatically evicted when expired.',
        ],
        tables: [
          {
            headers: ['Feature', 'db', 'memory'],
            rows: [
              ['Persistence', 'Disk (survives restart)', 'RAM only (lost on restart)'],
              ['TTL Support', 'No expiry', 'Auto-expires (default 1.0 hour)'],
              ['Use Case', 'Permanent collections', 'Sessions, caches, transient state'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Memory Store Operations with TTL',
            language: 'javascript',
            runnable: true,
            code: `// Insert with default TTL (1 hour)
memory.sessions.insert({ userId: "user_123", token: "xyz" });

// Insert with custom TTL (2.5 hours)
memory.sessions.insert({ userId: "user_456", token: "abc" }, 2.5);

// Query active memory records
var active = memory.sessions.findall(s => s.token != null);

// Delete expired or specific session
memory.sessions.findall(s => s.userId == "user_123").delete();`,
          },
        ],
      },
      {
        id: 'bulk-store',
        categoryId: 'javascript-api',
        title: 'Bulk Store (JSONL)',
        icon: '💾',
        summary: 'High-performance JSON Lines (JSONL) storage for large static lookup datasets with LRU cache and chunked queries.',
        keywords: ['bulk', 'jsonl', 'reload', 'lru', 'large', 'static', 'lookup', 'postalcodes', 'countries'],
        paragraphs: [
          'The top-level bulk object manages collections stored as .jsonl files in the Bulk/ folder. It uses an LRU memory cache bounded by bulkStoreMaxCacheBytes (default 50 MB) and watches files for automatic cache invalidation.',
        ],
        codeExamples: [
          {
            title: 'Bulk Insert, Query & Cache Reload',
            language: 'javascript',
            runnable: true,
            code: `// Bulk initialize with an array of objects
bulk.countries.insert([
  { name: "Turkey", code: "TR", population: 85000000 },
  { name: "Germany", code: "DE", population: 83000000 }
]);

// Find record from bulk store
var tr = bulk.countries.find(c => c.code == "TR");

// Case-insensitive substring search on bulk data
var districts = bulk.postalcodes.findall(x => x.placeName.contains("esen"));

// Manually reload cache for a collection (or all if omitted)
bulk.reload("countries");`,
          },
        ],
      },
      {
        id: 'joins',
        categoryId: 'javascript-api',
        title: 'Join Operations',
        icon: '🔗',
        summary: 'Multi-collection joins using named aliases via alias(source, name) or default positional indexes (j1, j2, j3).',
        keywords: ['join', 'alias', 'where', 'j1', 'j2', 'birleştirme', 'ilişki'],
        paragraphs: [
          'AxarDB supports joining multiple collections or literal arrays using db.join(...). Use alias(source, name) for readable named joins, or access sources by position as j1, j2, j3.',
        ],
        codeExamples: [
          {
            title: 'Named Joins & Indexed Joins',
            language: 'javascript',
            runnable: true,
            code: `// 1. Recommended: Named Join with alias()
var ordersWithUsers = db.join(
  alias(db.users, "user"),
  alias(db.orders, "order"),
  alias(db.products, "product")
)
.where(x =>
  x.user._id == x.order.userId &&
  x.order.productId == x.product._id
)
.select(x => ({
  customer: x.user.name,
  item: x.product.name,
  date: x.order.createdAt
}));

// 2. Default Indexed Join (j1 = products, j2 = categories)
var catalog = db.join(db.products, db.categories)
  .where(x => x.j1.categoryId == x.j2._id)
  .select(x => ({
    name: x.j1.productName,
    category: x.j2.categoryName
  }));`,
          },
        ],
      },
      {
        id: 'uuid-v7',
        categoryId: 'javascript-api',
        title: 'UUID v7 Support',
        icon: '🆔',
        summary: 'Chronologically ordered RFC 9562 UUID v7 default document IDs with guidv7() and timestamp extraction.',
        keywords: ['uuid', 'guidv7', 'guidv7CreatedAt', 'guid', '_id', 'rfc9562', 'timestamp'],
        tables: [
          {
            headers: ['Function', 'Description', 'Example'],
            rows: [
              ['guidv7()', 'Generates a new UUID v7 using current UTC time', 'guidv7()'],
              ['guidv7(datetime)', 'Generates a UUID v7 for an ISO 8601 datetime', 'guidv7("2024-01-15T10:30:00Z")'],
              ['guidv7CreatedAt(id)', 'Extracts UTC creation Date from a UUID v7 string', 'guidv7CreatedAt(doc._id)'],
              ['guid()', 'Generates a standard UUID v4 (legacy)', 'guid()'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Generating & Inspecting UUID v7',
            language: 'javascript',
            runnable: true,
            code: `// Insert with custom historical UUID v7 timestamp
db.history.insert({
  _id: guidv7("2024-01-15T10:30:00Z"),
  event: "Legacy Import"
});

// Extract creation timestamp from a document's _id
var doc = db.users.find(u => u.name == "John");
if (doc && doc._id) {
  var createdTime = guidv7CreatedAt(doc._id);
  console.log("Created at: " + createdTime);
}`,
          },
        ],
      },
      {
        id: 'indexing',
        categoryId: 'javascript-api',
        title: 'Creating Index',
        icon: '📊',
        summary: 'Create ASC or DESC indexes on collection fields and inspect existing indexes with getIndexes().',
        keywords: ['index', 'getIndexes', 'asc', 'desc', 'performance', 'indeks'],
        codeExamples: [
          {
            title: 'Creating & Inspecting Indexes',
            language: 'javascript',
            runnable: true,
            code: `// Create ASC index (default)
db.users.index(x => x.email);

// Create DESC index
db.orders.index(x => x.createdAt, "DESC");

// List existing indexes for a collection
var indexes = getIndexes("users");`,
          },
        ],
      },
      {
        id: 'prototype-extensions',
        categoryId: 'javascript-api',
        title: 'Prototype Extensions & Case-Insensitive Search',
        icon: '🧩',
        summary: 'Built-in Turkish-aware String (.contains, .startsWith, .toLowerCase), Array (.count, .distinct), and Object (.includes, .toList) extensions.',
        keywords: ['prototype', 'contains', 'startsWith', 'toLowerCase', 'includes', 'turkish', 'case-insensitive', 'büyük küçük harf'],
        paragraphs: [
          'AxarDB provides two distinct case-insensitive search mechanisms: (1) Collection-level db.collection.contains(predicate) for case-insensitive exact match, and (2) String.prototype.contains(str) for Turkish-aware case-insensitive substring matching.',
        ],
        tables: [
          {
            headers: ['Target', 'Method', 'Description', 'Example'],
            rows: [
              ['Collection', 'db.col.contains(fn)', 'Case-insensitive property access & exact equality', 'db.users.contains(x => x.title == "developer")'],
              ['String', '.contains(str)', 'Case-insensitive, Turkish-aware substring search', '"İstanbul".contains("istan") -> true'],
              ['String', '.startsWith(str)', 'Case-insensitive, Turkish-aware prefix check', '"İZMİR".startsWith("izm") -> true'],
              ['String', '.toLowerCase()', 'Turkish-aware lowercase (İ->i, I->i, Ş->ş, Ğ->ğ)', '"İZMİR".toLowerCase() -> "izmir"'],
              ['Array', '.count(predicate?)', 'Element count or conditional match count', 'arr.count(x => x.age > 18)'],
              ['Array', '.distinct(selector?)', 'Unique values with optional selector', 'arr.distinct(x => x.role)'],
              ['Object', '.includes(arr)', 'Single value IN array check, or Array SequenceEqual', 'x.rowNumber.includes([66, 69, 74])'],
              ['Object / Array', '.toList()', 'Converts ResultSet/enumerable to standard JS array', 'db.users.findall().toList()'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Case-Insensitive & Turkish-Aware Queries',
            language: 'javascript',
            runnable: true,
            code: `// 1. Collection-level exact match (case-insensitive)
var devs = db.users.contains(x => x.title == "developer");

// 2. String prototype substring search (Turkish-aware)
var matches = bulk.postalcodes.findall(x => x.placeName.contains("esen"));

// 3. Object.prototype.includes (IN array / SequenceEqual)
var targetIds = [66, 69, 74];
var rows = db.categories.findall(x => x.rowNumber != null && x.rowNumber.includes(targetIds));`,
          },
        ],
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    icon: '⚙️',
    description: 'Views, Triggers, Vaults, Webhooks, External Databases, Queue Jobs, Data Recovery, sysconfig, syslogs, and Monitoring.',
    topics: [
      {
        id: 'views',
        categoryId: 'advanced',
        title: 'Views (Stored Queries)',
        icon: '👁️',
        summary: 'Server-side stored JavaScript queries in Views/ with // @access public|private metadata and @param binding.',
        keywords: ['view', 'saveView', 'getView', 'deleteView', 'access', 'public', 'private', 'stored query', 'görünüm'],
        paragraphs: [
          'Views are reusable server-side scripts saved in the Views/ directory. Every view must declare // @access public (callable via HTTP GET /views/{name} without auth) or // @access private (requires Basic Auth / internal db.view()) on its first line.',
        ],
        codeExamples: [
          {
            title: 'Creating & Calling Views',
            language: 'javascript',
            runnable: true,
            code: `// Create a public view with @param placeholders
db.saveView("getUsersByAge", \`
// @access public
var minAge = @minAge;
var maxAge = @maxAge;
return db.users.findall(u => u.age >= minAge && u.age <= maxAge);
\`);

// Execute a view from JavaScript with parameters
var result = db.view("getUsersByAge", { minAge: 18, maxAge: 65 });

// Read view source code or delete view
var code = db.getView("getUsersByAge");
// db.deleteView("getUsersByAge");`,
          },
        ],
      },
      {
        id: 'triggers',
        categoryId: 'advanced',
        title: 'Triggers (Event Handlers)',
        icon: '🔔',
        summary: 'Asynchronous scripts that react automatically to created, changed, or deleted events on target collections.',
        keywords: ['trigger', 'saveTrigger', 'deleteTrigger', 'target', 'event', 'created', 'changed', 'deleted', 'tetikleyici'],
        paragraphs: [
          'Triggers monitor file changes in Data/ and execute asynchronously when documents in the @target collection(s) are created, changed, or deleted. Execution logs are written to trigger_logs/.',
        ],
        tables: [
          {
            headers: ['Property', 'Values / Type', 'Description'],
            rows: [
              ['event.type', '"created" | "changed" | "deleted"', 'Type of modification'],
              ['event.collection', 'string', 'Name of the modified collection'],
              ['event.documentId', 'string', '_id of the affected document'],
              ['event.timestamp', 'string (ISO 8601)', 'Server timestamp of the event'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Creating & Managing a Trigger',
            language: 'javascript',
            runnable: true,
            code: `// Create a trigger on "users" collection
db.saveTrigger("userNotifier", "users", \`
// @target users
console.log("User changed: " + event.documentId + " (" + event.type + ")");
webhook("https://api.example.com/notify",
  { id: event.documentId, type: event.type },
  { "Authorization": "Bearer " + $API_TOKEN }
);
\`);

// Delete a trigger
// db.deleteTrigger("userNotifier");`,
          },
        ],
      },
      {
        id: 'vaults',
        categoryId: 'advanced',
        title: 'Vaults (Secure Key-Value Storage)',
        icon: '🔐',
        summary: 'Store secrets and API keys in sysvaults via addVault() and reference them with $KEY_NAME in scripts.',
        keywords: ['vault', 'addVault', 'sysvaults', 'secret', 'api key', 'encrypt', 'kasa'],
        callouts: [
          {
            kind: 'warning',
            title: 'Direct Insert Restricted',
            text: 'Direct insertion via db.sysvaults.insert() is blocked. Always use addVault(key, value) to store secrets.',
          },
        ],
        codeExamples: [
          {
            title: 'Adding & Using Vault Secrets',
            language: 'javascript',
            runnable: true,
            code: `// Store secrets in Vault
addVault("API_TOKEN", "sk-xxxx...");
addVault("SLACK_WEBHOOK", "https://hooks.slack.com/...");
addVault("LOGIN_SALT", "mysecretkey123");

// Reference secrets at runtime via $KEY_NAME
var token = encrypt("payload", $LOGIN_SALT);`,
          },
        ],
      },
      {
        id: 'webhooks',
        categoryId: 'advanced',
        title: 'Webhooks & HTTP Requests',
        icon: '🌐',
        summary: 'Send external HTTP POST requests with webhook(url, data, headers) and GET requests with httpGet(url, headers).',
        keywords: ['webhook', 'httpGet', 'http', 'post', 'get', 'external api', 'headers'],
        codeExamples: [
          {
            title: 'Sending POST Webhooks & GET Requests',
            language: 'javascript',
            runnable: true,
            code: `// HTTP POST via webhook(url, data, headers)
var postRes = webhook("https://api.example.com/notify",
  { userId: 123, action: "update" },
  {
    "Authorization": "Bearer " + $API_TOKEN,
    "Content-Type": "application/json"
  }
);

// HTTP GET via httpGet(url, headers?)
var getRes = httpGet("https://api.example.com/data", {
  "Authorization": "Bearer " + $API_TOKEN
});`,
          },
        ],
      },
      {
        id: 'external-db',
        categoryId: 'advanced',
        title: 'External Databases (MySQL & PostgreSQL)',
        icon: '🗄️',
        summary: 'Query and execute parameterized SQL commands on external MySQL/MariaDB and PostgreSQL databases.',
        keywords: ['mysql', 'mariadb', 'postgresql', 'pgsql', 'mysqlRead', 'mysqlExec', 'pgsqlRead', 'pgsqlExec', 'sql'],
        codeExamples: [
          {
            title: 'MySQL/MariaDB & PostgreSQL Queries',
            language: 'javascript',
            runnable: true,
            code: `// MySQL / MariaDB
var myConn = "Server=127.0.0.1;Database=test;Uid=root;Pwd=pass;";
var users = mysqlRead(myConn, "SELECT id, name FROM users WHERE age > @age", { age: 18 });
var deleted = mysqlExec(myConn, "DELETE FROM logs WHERE created_at < @date", { date: "2024-01-01" });

// PostgreSQL
var pgConn = "Host=localhost;Database=testdb;Username=postgres;Password=secret";
var reports = pgsqlRead(pgConn, "SELECT id, json_data FROM reports WHERE created_at > @date", { date: "2024-01-01" });
var updated = pgsqlExec(pgConn, "UPDATE reports SET status = 'archived' WHERE id = @id", { id: 100 });`,
          },
        ],
      },
      {
        id: 'queue',
        categoryId: 'advanced',
        title: 'Queue Operations (Background Jobs)',
        icon: '⏳',
        summary: 'Schedule parameterized background jobs with priority using queue() and monitor status in db.sysqueue.',
        keywords: ['queue', 'sysqueue', 'background', 'job', 'priority', 'completedAt', 'kuyruk'],
        paragraphs: [
          'Use queue(template, params?, options?) to schedule background tasks. Direct inserts into db.sysqueue are prohibited. Jobs are tracked in db.sysqueue with _id, queryTemplate, parameters, options, createdAt, executionTime, completedAt, priority, duration, successResult, and errorMessage.',
        ],
        codeExamples: [
          {
            title: 'Scheduling & Inspecting Queue Jobs',
            language: 'javascript',
            runnable: true,
            code: `// Schedule a high-priority background job with @param binding
var jobId = queue(
  "db.users.update(u => u._id == @id, { active: true })",
  { id: "user_123" },
  { priority: 1 }
);

// Inspect pending or failed jobs in db.sysqueue
var jobs = db.sysqueue.findall(j => j.completedAt == null);`,
          },
        ],
      },
      {
        id: 'data-recovery',
        categoryId: 'advanced',
        title: 'Data Recovery (Fail-safe Backup)',
        icon: '🛡️',
        summary: 'Automatic reverse query generation in backup_queries/YYYY-MM-DD.txt for every state-changing operation.',
        keywords: ['backup', 'recovery', 'fail-safe', 'reverse', 'undo', 'backup_queries', 'veri kurtarma', 'yedek'],
        paragraphs: [
          'Every state-changing operation (insert, update, delete, drop, saveView, deleteTrigger) across db, bulk, and sys collections automatically generates a reverse undo query in backup_queries/YYYY-MM-DD.txt.',
          'Backup logging runs inside a fail-safe wrapper so I/O errors never interrupt the primary database transaction.',
        ],
      },
      {
        id: 'system-config',
        categoryId: 'advanced',
        title: 'System Configuration (sysconfig)',
        icon: '🔧',
        summary: 'Manage server-wide limits in sysconfig and understand reserved sys* system collections.',
        keywords: ['sysconfig', 'sysusers', 'sysvaults', 'sysqueue', 'syslogs', 'memoryLimitPercentage', 'bulkStoreMaxCacheBytes', 'maxRecursionDepth', 'queryTimeoutMinutes', 'queuePollIntervalSeconds', 'yapılandırma'],
        tables: [
          {
            headers: ['Field', 'Type', 'Default', 'Description'],
            rows: [
              ['memoryLimitPercentage', 'double', '0.4 (40%)', 'Max system RAM ratio used for document caching'],
              ['bulkStoreMaxCacheBytes', 'long', '52428800 (50 MB)', 'Max bytes for Bulk Store LRU memory cache'],
              ['maxRecursionDepth', 'int', '100', 'Maximum script recursion depth'],
              ['queryTimeoutMinutes', 'int', '10', 'Maximum execution time (minutes) before cancellation'],
              ['queuePollIntervalSeconds', 'double', '1.0', 'Background queue polling interval in seconds'],
            ],
          },
          {
            headers: ['System Collection', 'Purpose', 'Write Rule'],
            rows: [
              ['sysusers', 'Basic Auth user credentials', 'Insert via db.sysusers.insert()'],
              ['sysvaults', 'Encrypted secret key-value store', 'Must use addVault(key, value)'],
              ['sysconfig', 'Server-wide configuration settings', 'Update only (restart required)'],
              ['sysqueue', 'Background job execution queue', 'Must use queue(script, params, opts)'],
              ['syslogs', 'Virtual read-only system logs', 'Strictly read-only'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Reading & Updating sysconfig',
            language: 'javascript',
            runnable: true,
            code: `// Read current server configuration
var cfg = db.sysconfig.findall().first();

// Update configuration (requires server restart to take effect)
db.sysconfig.update(x => true, {
  queryTimeoutMinutes: 15
});`,
          },
        ],
      },
      {
        id: 'syslogs',
        categoryId: 'advanced',
        title: 'System Log Querying (db.syslogs)',
        icon: '📝',
        summary: 'Query structured request, error, and debug logs directly via the virtual read-only db.syslogs collection.',
        keywords: ['syslogs', 'logs', 'audit', 'error', 'request', 'debug', 'durationMs', 'log sorgulama'],
        paragraphs: [
          'db.syslogs is a virtual read-only collection that parses request, error, and debug logs on demand into time-ordered documents (_id, timestamp, type, ip, user, query, durationMs, status) with newest entries first.',
        ],
        codeExamples: [
          {
            title: 'Auditing & Diagnosing with db.syslogs',
            language: 'javascript',
            runnable: true,
            code: `// 1. Get recent 50 system logs (newest first)
var recent = db.syslogs.take(50);

// 2. Find all error logs or failed requests
var errors = db.syslogs.findall(l => l.type == "error" || l.status.startsWith("Failed"));

// 3. Inspect slow queries (> 100ms)
var slow = db.syslogs.findall(l => l.durationMs > 100).take(20);

// 4. Search logs mentioning a collection or keyword
var audit = db.syslogs.findall(l => l.query.contains("sysvaults")).take(20);`,
          },
        ],
      },
      {
        id: 'monitoring',
        categoryId: 'advanced',
        title: 'Real-time Monitoring Dashboard',
        icon: '📈',
        summary: 'Track live queries/min, RAM allocation, rolling HTTP logs, active memory collections, and cost analytics via /metrics and /monitor.',
        keywords: ['monitoring', 'metrics', 'dashboard', 'cost', 'analytics', 'ram', 'izleme'],
        bullets: [
          'Metrics Charts: Live time-series tracking of queries/min and RAM allocation via GET /metrics.',
          'Database Logs: Rolling log of recent HTTP requests, status codes, and execution durations.',
          'Memory Collections: Active TTL collection record counts and RAM state.',
          'Cost Analytics: Call counts, min/avg/max durations, and error rates for Views, Triggers, and Queue Jobs.',
        ],
      },
    ],
  },
  {
    id: 'http-security',
    title: 'HTTP & Security',
    icon: '🔒',
    description: 'HTTP REST endpoints, @param query parameter binding, Basic Authentication, and injection safeguards.',
    topics: [
      {
        id: 'http-api',
        categoryId: 'http-security',
        title: 'HTTP API Endpoints',
        icon: '🌐',
        summary: 'REST endpoints for executing scripts (/query), listing/dropping collections, calling views, and reading metrics.',
        keywords: ['http', 'api', 'endpoint', 'rest', '/query', '/collections', '/views', '/triggers', '/memory/list', '/bulk/list', '/metrics', 'curl'],
        tables: [
          {
            headers: ['Endpoint', 'Method', 'Description', 'Auth'],
            rows: [
              ['/query', 'POST', 'Execute JavaScript query (supports ?param=val binding)', 'Basic Auth'],
              ['/collections', 'GET', 'List all standard & system collections', 'Basic Auth'],
              ['/collections/{name}', 'DELETE', 'Delete collection from RAM and Disk', 'Basic Auth'],
              ['/views/{name}', 'GET', 'Execute stored view (query params bind to @param)', '@access'],
              ['/views/{name}', 'DELETE', 'Delete stored view', 'Basic Auth'],
              ['/triggers/{name}', 'DELETE', 'Delete trigger script', 'Basic Auth'],
              ['/memory/list', 'GET', 'List active Memory Store collections and counts', 'Basic Auth'],
              ['/bulk/list', 'GET', 'List Bulk Store JSONL collections, counts, and sizes', 'Basic Auth'],
              ['/metrics', 'GET', 'Server performance and memory metrics snapshot', 'Basic Auth'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Parameterized Query Binding (@param)',
            language: 'javascript',
            runnable: true,
            code: `// HTTP: POST /query?userName=John&minAge=20
// Body uses @param placeholders (safe from injection):
db.users.findall(u => u.name == @userName && u.age >= @minAge);`,
          },
        ],
      },
      {
        id: 'security',
        categoryId: 'http-security',
        title: 'Security & Authentication',
        icon: '🛡️',
        summary: 'HTTP Basic Authentication, SHA256 password hashing in sysusers, @param injection protection, and blocked patterns.',
        keywords: ['security', 'auth', 'basic auth', 'sha256', 'sysusers', 'injection', 'eval', 'unlocker', 'güvenlik', 'kimlik doğrulama'],
        bullets: [
          'Basic Authentication: Required for /query, /collections, and private views (default user: unlocker / unlocker).',
          'Password Hashing: Supports both plain text and SHA256 hashed passwords in db.sysusers.',
          'Parameter Injection Safety: Never concatenate user strings into scripts; bind via query parameters and @param placeholders.',
          'Malicious Code Blocking: Dangerous patterns like eval(), Function(), and <script> tags are rejected automatically.',
        ],
        codeExamples: [
          {
            title: 'Adding Database Users with SHA256 Password',
            language: 'javascript',
            runnable: true,
            code: `// Recommended: Insert user with SHA256 hashed password
db.sysusers.insert({
  username: "admin",
  password: sha256("StrongPassword123!")
});`,
          },
        ],
      },
    ],
  },
  {
    id: 'sdks-tools',
    title: 'SDKs & Tools',
    icon: '🧰',
    description: 'Official .NET (C#) SDK, Python SDK, AxarDB CLI tool, and Multi-Engine Benchmark runner.',
    topics: [
      {
        id: 'dotnet-sdk',
        categoryId: 'sdks-tools',
        title: '.NET SDK (C#)',
        icon: '🟣',
        summary: 'Integrate AxarDB into C# / .NET applications with AxarClient, parameterized queries, Fluent Builder, Views, and Vaults.',
        keywords: ['dotnet', 'c#', 'csharp', 'sdk', 'AxarClient', 'InsertAsync', 'QueryAsync', 'UpdateAsync', 'CreateViewAsync', 'CallViewAsync'],
        codeExamples: [
          {
            title: 'C# AxarClient Usage',
            language: 'csharp',
            code: `using AxarDB.Sdk;

using var client = new AxarClient("http://localhost:5000", "unlocker", "unlocker");

// Insert Document
await client.InsertAsync("users", new { Name = "John", Age = 30 });

// Parameterized Query
var script = "db.users.findall(u => u.name == @name)";
var users = await client.QueryAsync<List<User>>(script, new { name = "John" });

// Fluent Builder API
var count = await client.Collection<User>("users").Where("age", ">", 18).CountAsync();
var first = await client.Collection<User>("users").FirstAsync();

// Views & Vault
await client.CreateViewAsync("ActiveUsers", "// @access public\\nreturn db.users.findall(u => u.active == true);");
var active = await client.CallViewAsync<List<User>>("ActiveUsers");
await client.AddVaultAsync("MY_SECRET", "12345");`,
          },
        ],
      },
      {
        id: 'python-sdk',
        categoryId: 'sdks-tools',
        title: 'Python SDK',
        icon: '🐍',
        summary: 'Interact with AxarDB from Python applications using AxarClient and chainable collection builders.',
        keywords: ['python', 'sdk', 'AxarClient', 'to_list', 'create_view', 'call_view'],
        codeExamples: [
          {
            title: 'Python AxarClient Usage',
            language: 'python',
            code: `from axardb import AxarClient

client = AxarClient("http://localhost:5000", "unlocker", "unlocker")

# Insert & Query
client.insert("users", {"name": "John", "age": 30})
users = client.collection("users").where("age", ">", 20).to_list()

# Count & Delete
count = client.collection("users").count()
client.collection("users").where("age", "<", 18).delete()

# View Management
client.create_view("MyView", "// @access public\\nreturn db.users.take(10)")
res = client.call_view("MyView", {"minAge": 18})`,
          },
        ],
      },
      {
        id: 'cli-tool',
        categoryId: 'sdks-tools',
        title: 'CLI Tool (AxarDB.Cli)',
        icon: '💻',
        summary: 'Execute scripts, import JSON documents, list collections, and configure CORS from the command line.',
        keywords: ['cli', 'terminal', 'AxarDB.Cli', 'cors', 'show-collections', 'script', 'komut satırı'],
        codeExamples: [
          {
            title: 'CLI Commands & Server Flags',
            language: 'bash',
            code: `# Execute inline script
./AxarDB.Cli -s "db.users.count()"

# Automated CI/CD execution with file input and output
./AxarDB.Cli -u unlocker -p unlocker -f query.js -o result.json

# List collections or insert JSON
./AxarDB.Cli --show-collections
./AxarDB.Cli --insert users "{\\"name\\":\\"Alice\\"}"

# Start server with custom port and restricted CORS origins
dotnet run -- -p 5001 --cors "http://localhost:3000,https://example.com"`,
          },
        ],
      },
      {
        id: 'benchmark',
        categoryId: 'sdks-tools',
        title: 'Multi-Engine Benchmark Tool',
        icon: '📊',
        summary: 'Compare AxarDB (db, memory, bulk) throughput against PostgreSQL, MariaDB, and MongoDB using compare.py.',
        keywords: ['benchmark', 'compare.py', 'performance', 'postgresql', 'mariadb', 'mongodb', 'chart.js'],
        bullets: [
          'Measures DDL setup, single/bulk insert, index creation, count, filter, range, aggregation, update, and delete.',
          'Captures pure engine times server-side via sysqueue Stopwatch (excluding HTTP overhead).',
          'Generates an interactive HTML report (output.html) with Chart.js visualizations and speedup comparison against AxarDB (memory).',
        ],
      },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    icon: '📚',
    description: 'Complete reference of built-in global utility functions, common query patterns, and troubleshooting guide.',
    topics: [
      {
        id: 'utilities',
        categoryId: 'reference',
        title: 'Utility Functions Reference',
        icon: '🛠️',
        summary: 'Crypto/Hashing (md5, sha256, encrypt, decrypt, Base64), Random, AI/LLM (openai), CSV, Date math, and System helpers.',
        keywords: [
          'utilities', 'functions', 'md5', 'sha256', 'encrypt', 'decrypt', 'toBase64', 'fromBase64',
          'randomString', 'randomNumber', 'randomDecimal', 'openai', 'addSysMsg', 'llm',
          'toString', 'split', 'toDecimal', 'toJson', 'deepcopy', 'csv',
          'addMinutes', 'addHours', 'addDays', 'showCollections', 'getIndexes', 'console.log',
          'yardımcı fonksiyonlar',
        ],
        tables: [
          {
            headers: ['Category', 'Function', 'Description'],
            rows: [
              ['Crypto', 'md5(str) / sha256(str)', 'Compute MD5 or SHA256 hash string'],
              ['Crypto', 'encrypt(text, salt) / decrypt(text, salt)', 'AES encryption and decryption (Base64)'],
              ['Encoding', 'toBase64(str) / fromBase64(str)', 'Base64 encode and decode'],
              ['ID & Random', 'guidv7(date?) / guidv7CreatedAt(id) / guid()', 'UUID v7 / v4 generation and timestamp extraction'],
              ['ID & Random', 'randomString(len) / randomNumber(min, max) / randomDecimal(min, max)', 'Random alphanumeric, integer, or decimal'],
              ['AI / LLM', 'openai(url, token) -> llm.addSysMsg(s), llm.msg(u, data, model)', 'OpenAI-compatible LLM client inside scripts'],
              ['Data & CSV', 'csv(input) / toJson(obj) / deepcopy(obj)', 'Bidirectional CSV parser/generator, JSON serializer, deep clone'],
              ['Conversion', 'toString(v) / split(str, sep) / toDecimal(str)', 'String and decimal conversion utilities'],
              ['Date Math', 'addMinutes(d, n) / addHours(d, n) / addDays(d, n)', 'Add minutes, hours, or days to a Date'],
              ['System', 'showCollections() / getIndexes(col) / queue(...) / addVault(k, v)', 'System inspection, background jobs, and vault'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Utility Functions in Action',
            language: 'javascript',
            runnable: true,
            code: `// Crypto & Hashing
var hash = sha256("password123");
var cipher = encrypt("sensitive-data", "my-salt");
var plain = decrypt(cipher, "my-salt");

// Bidirectional CSV Engine
var rows = csv("id,name\\n1,Alice\\n2,Bob");
var csvText = csv(rows);

// Date Manipulation
var expiresAt = addHours(new Date(), 2);
var nextWeek = addDays(new Date(), 7);

// OpenAI Compatible LLM Client
// var ai = openai("https://api.openai.com/v1/chat/completions", $OPENAI_KEY);
// ai.addSysMsg("You are a helpful assistant");
// var reply = ai.msg("Summarize user stats", {}, "gpt-4o-mini");`,
          },
        ],
      },
      {
        id: 'troubleshooting',
        categoryId: 'reference',
        title: 'Common Patterns & Troubleshooting',
        icon: '💡',
        summary: 'Frequent mistakes to avoid, pagination & aggregation patterns, and common HTTP/script error solutions.',
        keywords: ['troubleshooting', 'mistakes', 'error', '401', '404', 'syntaxerror', 'pagination', 'aggregation', 'sorun giderme', 'hata'],
        tables: [
          {
            headers: ['Mistake / Symptom', 'Solution'],
            rows: [
              ['Using MongoDB object filter { age: { $gt: 18 } }', 'Use JS arrow predicate: db.users.findall(u => u.age > 18)'],
              ['Calling db.users.findOne(...)', 'findOne() does not exist; use db.users.find(u => ...)'],
              ['Single = in predicate (u => u.age = 25)', 'Use == for equality comparison: u => u.age == 25'],
              ['Forgetting // @access public in a View', 'Add // @access public or // @access private on line 1 of the view'],
              ['401 Unauthorized on /query or /collections', 'Verify Basic Auth credentials (default: unlocker / unlocker)'],
              ['Case-sensitive string match issues', 'Use field.contains("text") for case-insensitive Turkish-aware substring search'],
            ],
          },
        ],
        codeExamples: [
          {
            title: 'Common Aggregation & Pagination Patterns',
            language: 'javascript',
            runnable: true,
            code: `// Pagination: Page 2 (records 11-20)
var page2 = db.products.findall().skip(10).take(10);

// Custom Aggregation with foreach
var totalRevenue = 0;
db.orders.findall(o => o.status == "completed").foreach(o => {
  totalRevenue += o.amount;
});
return { totalRevenue: totalRevenue };`,
          },
        ],
      },
    ],
  },
];

export interface DocSearchCriteria {
  /** Global search query across categories/topics */
  globalQuery?: string;
  /** Optional category restriction ('all' or specific DocCategoryId) */
  categoryId?: DocCategoryId | 'all';
  /** Field scope for search ('all' | 'title' | 'code' | 'content') */
  fieldScope?: DocSearchFieldScope;
  /** Category-local specific search queries keyed by DocCategoryId */
  categoryQueries?: Partial<Record<DocCategoryId, string>>;
  /** Topic-local specific search queries keyed by topic.id */
  topicQueries?: Record<string, string>;
}

export interface FilteredDocTopicResult {
  topic: DocTopic;
  matchCount: number;
  effectiveHighlightTerms: string[];
}

export interface FilteredDocCategoryResult {
  category: DocCategory;
  topics: FilteredDocTopicResult[];
  totalTopicCount: number;
  matchedTopicCount: number;
  totalMatchOccurrences: number;
}

export function normalizeSearchText(input: string): string {
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .trim();
}

export function countSubstringOccurrences(haystack: string, needle: string): number {
  const normHaystack = normalizeSearchText(haystack);
  const normNeedle = normalizeSearchText(needle);
  if (!normNeedle || !normHaystack) return 0;

  let count = 0;
  let pos = 0;
  while (true) {
    const idx = normHaystack.indexOf(normNeedle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + normNeedle.length;
  }
  return count;
}

export function getTopicSearchableText(topic: DocTopic, scope: DocSearchFieldScope = 'all'): string {
  const titlePart = [topic.title, ...topic.keywords].join(' ');
  const codePart = (topic.codeExamples ?? [])
    .map((ex) => `${ex.title ?? ''} ${ex.code}`)
    .join('\n');
  const contentPart = [
    topic.summary,
    ...(topic.paragraphs ?? []),
    ...(topic.bullets ?? []),
    ...(topic.callouts ?? []).map((c) => `${c.title} ${c.text}`),
    ...(topic.tables ?? []).flatMap((t) => [...t.headers, ...t.rows.flat()]),
  ].join(' ');

  switch (scope) {
    case 'title':
      return titlePart;
    case 'code':
      return codePart;
    case 'content':
      return contentPart;
    case 'all':
    default:
      return `${titlePart}\n${contentPart}\n${codePart}`;
  }
}

export function filterDocsCatalog(
  criteria: DocSearchCriteria,
  catalog: readonly DocCategory[] = AXAR_DOCS_CATALOG
): FilteredDocCategoryResult[] {
  const globalQuery = (criteria.globalQuery ?? '').trim();
  const scope = criteria.fieldScope ?? 'all';
  const categoryFilter = criteria.categoryId ?? 'all';
  const categoryQueries = criteria.categoryQueries ?? {};
  const topicQueries = criteria.topicQueries ?? {};

  const results: FilteredDocCategoryResult[] = [];

  for (const cat of catalog) {
    if (categoryFilter !== 'all' && cat.id !== categoryFilter) {
      continue;
    }

    const catLocalQuery = (categoryQueries[cat.id] ?? '').trim();
    const matchedTopics: FilteredDocTopicResult[] = [];
    let categoryOccurrences = 0;

    for (const topic of cat.topics) {
      const topicLocalQuery = (topicQueries[topic.id] ?? '').trim();
      const searchableByScope = getTopicSearchableText(topic, scope);
      const fullSearchable = getTopicSearchableText(topic, 'all');

      let matchesGlobal = true;
      let globalHits = 0;
      if (globalQuery.length > 0) {
        globalHits = countSubstringOccurrences(searchableByScope, globalQuery);
        matchesGlobal = globalHits > 0;
      }

      let matchesCatLocal = true;
      let catHits = 0;
      if (catLocalQuery.length > 0) {
        catHits = countSubstringOccurrences(fullSearchable, catLocalQuery);
        matchesCatLocal = catHits > 0;
      }

      let matchesTopicLocal = true;
      let topicHits = 0;
      if (topicLocalQuery.length > 0) {
        topicHits = countSubstringOccurrences(fullSearchable, topicLocalQuery);
        matchesTopicLocal = topicHits > 0;
      }

      if (matchesGlobal && matchesCatLocal && matchesTopicLocal) {
        const terms: string[] = [];
        if (globalQuery) terms.push(globalQuery);
        if (catLocalQuery && !terms.includes(catLocalQuery)) terms.push(catLocalQuery);
        if (topicLocalQuery && !terms.includes(topicLocalQuery)) terms.push(topicLocalQuery);

        const matchCount = globalHits + catHits + topicHits;
        categoryOccurrences += matchCount;

        matchedTopics.push({
          topic,
          matchCount,
          effectiveHighlightTerms: terms,
        });
      }
    }

    const hasActiveFilter =
      globalQuery.length > 0 ||
      catLocalQuery.length > 0 ||
      categoryFilter !== 'all';

    if (!hasActiveFilter || matchedTopics.length > 0 || catLocalQuery.length > 0) {
      results.push({
        category: cat,
        topics: matchedTopics,
        totalTopicCount: cat.topics.length,
        matchedTopicCount: matchedTopics.length,
        totalMatchOccurrences: categoryOccurrences,
      });
    }
  }

  return results;
}

