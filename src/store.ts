import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NativeState } from './native.ts';
import type { Provider, Recommendation, Choice, RunResult, Feedback } from './types.ts';

export type Task = { id: string; createdAt: string; sessionId: string; provider: Provider; cwd: string;
  prompt: string; context: string; recommendation: Recommendation; choice?: Choice; result?: RunResult;
  feedback?: Feedback; status: string; durationMs?: number; error?: string; native?: { decision: 'continued' | 'suggested' | 'advised' | 'switched' | 'kept'; catalogVerified: boolean; initialModel?: string; startedAt?: string } };
export type Session = { id: string; provider: Provider; cwd: string; nativeId?: string; currentModel?: string; clientState?: RunResult['clientState']; context: string; native?: NativeState };
export class Store {
  db: DatabaseSync;
  constructor(home: string, retentionDays = 90, busyTimeoutMs = 5000) {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const path = join(home, 'history.sqlite');
    this.db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=${Math.max(0, Math.floor(busyTimeoutMs))}; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, session_id TEXT NOT NULL, provider TEXT NOT NULL, cwd TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_recent ON tasks(created_at);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS classifier_budget (day TEXT PRIMARY KEY, calls INTEGER NOT NULL, reserved REAL NOT NULL);`);
    if (retentionDays) this.prune(retentionDays);
  }
  newSession(provider: Provider, cwd: string): Session {
    const s = { id: randomUUID(), provider, cwd, context: '' }; this.saveSession(s); return s;
  }
  saveSession(s: Session) { this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?)').run(s.id, JSON.stringify(s)); }
  session(id: string): Session | undefined {
    const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  sessions(): Session[] { return (this.db.prepare('SELECT body FROM sessions ORDER BY rowid DESC LIMIT 30').all() as { body: string }[]).map(r => JSON.parse(r.body)); }
  save(t: Task) { this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?, ?, ?, ?, ?, ?)').run(t.id, t.createdAt, t.sessionId, t.provider, t.cwd, JSON.stringify(t)); }
  task(id: string): Task | undefined {
    const r = this.db.prepare('SELECT body FROM tasks WHERE id=?').get(id) as { body: string } | undefined;
    return r ? JSON.parse(r.body) : undefined;
  }
  recent(limit = 100, provider?: Provider, cwd?: string): Task[] {
    const rows = provider && cwd
      ? this.db.prepare('SELECT body FROM tasks WHERE provider=? AND cwd=? ORDER BY created_at DESC LIMIT ?').all(provider, cwd, limit)
      : this.db.prepare('SELECT body FROM tasks ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as { body: string }[]).map(r => JSON.parse(r.body));
  }
  feedback(id: string, feedback: Feedback) {
    const t = this.task(id); if (!t) throw new Error(`Task not found: ${id}`);
    if (!['good','stronger','cheaper','unsure'].includes(feedback)) throw new Error('Use good, stronger, cheaper, or unsure.');
    if (!t.result) throw new Error('Feedback requires a task that actually ran.');
    t.feedback = feedback; this.save(t);
  }
  getMeta(key: string) { return (this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as { value: string } | undefined)?.value; }
  setMeta(key: string, value: string) { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(key, value); }
  reserveClassifier(day: string, cost: number, budget: number, maxCalls: number): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT calls, reserved FROM classifier_budget WHERE day=?').get(day) as { calls: number; reserved: number } | undefined;
      if ((row?.calls ?? 0) >= maxCalls || (row?.reserved ?? 0) + cost > budget) { this.db.exec('ROLLBACK'); return false; }
      this.db.prepare('INSERT INTO classifier_budget VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET calls=calls+1, reserved=reserved+excluded.reserved').run(day, cost);
      this.db.exec('COMMIT'); return true;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  prune(days: number) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const affected = this.db.prepare('SELECT DISTINCT session_id FROM tasks WHERE created_at < ?').all(cutoff) as { session_id: string }[];
    this.db.prepare('DELETE FROM tasks WHERE created_at < ?').run(cutoff);
    for (const row of affected) {
      this.scrubContext(row.session_id);
      this.db.prepare('DELETE FROM sessions WHERE id=? AND id NOT IN (SELECT session_id FROM tasks)').run(row.session_id);
    }
  }
  deleteTask(id: string) {
    const t = this.task(id); if (!t) throw new Error('Task not found.');
    this.db.prepare('DELETE FROM tasks WHERE id=?').run(id);
    this.scrubContext(t.sessionId);
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
  private scrubContext(sessionId: string) {
    const s = this.session(sessionId); if (s) { s.context = ''; if (s.native) { s.native.pending = undefined; s.native.activeTaskId = undefined; s.native.lastTaskId = undefined; } this.saveSession(s); }
    const rows = this.db.prepare('SELECT body FROM tasks WHERE session_id=?').all(sessionId) as { body: string }[];
    for (const row of rows) { const task = JSON.parse(row.body) as Task; task.context = ''; this.save(task); }
  }
  clear() { this.db.exec('DELETE FROM tasks; DELETE FROM sessions; DELETE FROM meta; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); }
  close() { this.db.close(); }
}
