/**
 * Database client for the execution layer.
 *
 * Creates a per-project SQLite database at .ringmaster/ringmaster.db
 * Automatically runs migrations on first connection.
 */

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Singleton database instance
let dbInstance: BetterSQLite3Database<typeof schema> | null = null;
let sqliteInstance: Database.Database | null = null;

/**
 * Get the database path for the current project.
 * Creates the .ringmaster directory if it doesn't exist.
 */
function getDbPath(): string {
  const projectRoot = process.cwd();
  const ringmasterDir = path.join(projectRoot, '.ringmaster');

  // Ensure .ringmaster directory exists
  if (!fs.existsSync(ringmasterDir)) {
    fs.mkdirSync(ringmasterDir, { recursive: true });
  }

  return path.join(ringmasterDir, 'ringmaster.db');
}

/**
 * SQL statements for schema initialization.
 * Split into individual statements for better-sqlite3's run() method.
 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    task_source TEXT NOT NULL,
    task_id TEXT NOT NULL,
    task_title TEXT,
    agent_session_id TEXT,
    agent_type TEXT DEFAULT 'claude-code',
    status TEXT NOT NULL,
    exit_code INTEGER,
    prompt TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL REFERENCES executions(id),
    chunk_index INTEGER NOT NULL,
    stream TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT,
    timestamp TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    task_source TEXT NOT NULL,
    task_id TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    cleanup_policy TEXT DEFAULT 'auto',
    created_at TEXT NOT NULL,
    touched_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_executions_task ON executions(task_source, task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_execution_logs_execution ON execution_logs(execution_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspaces_task ON workspaces(task_source, task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workspaces_touched ON workspaces(touched_at)`,
];

/**
 * Initialize the database with the schema.
 * Creates tables if they don't exist (idempotent).
 */
function initializeSchema(sqlite: Database.Database): void {
  for (const sql of SCHEMA_STATEMENTS) {
    sqlite.prepare(sql).run();
  }
}

/**
 * Get the database instance.
 * Creates the database and runs migrations if needed.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDbPath();
  sqliteInstance = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  sqliteInstance.pragma('journal_mode = WAL');

  // Initialize schema (creates tables if needed)
  initializeSchema(sqliteInstance);

  dbInstance = drizzle(sqliteInstance, { schema });

  console.log(`[db] Database initialized at ${dbPath}`);

  return dbInstance;
}

/**
 * Close the database connection.
 * Useful for testing and graceful shutdown.
 */
export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
    console.log('[db] Database connection closed');
  }
}

/**
 * Get the raw SQLite instance for direct queries.
 * Use sparingly - prefer Drizzle ORM methods.
 */
export function getSqlite(): Database.Database | null {
  return sqliteInstance;
}

// Re-export schema for convenience
export * from './schema';
