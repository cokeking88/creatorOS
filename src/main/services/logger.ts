import { appendFileSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry, LogFilter, LogLevel } from '../../shared/types.js';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const RING_CAPACITY = 2000;
const FLUSH_INTERVAL_MS = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RETENTION_DAYS = 7;

function levelThreshold(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return raw in LEVELS ? LEVELS[raw as LogLevel] : LEVELS.info;
}

/** Mutable state shared by the root logger and all its children. */
class LoggerState {
  ring: LogEntry[] = [];
  dir: string | null = null;
  seq = 0;
  pending: string[] = [];
  flushTimer: ReturnType<typeof setTimeout> | null = null;

  init(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.cleanupOldLogs();
  }

  push(entry: LogEntry, fileLine: string) {
    this.ring.push(entry);
    if (this.ring.length > RING_CAPACITY) this.ring.splice(0, this.ring.length - RING_CAPACITY);
    if (this.dir) {
      this.pending.push(fileLine);
      this.scheduleFlush();
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, FLUSH_INTERVAL_MS);
  }

  private flush() {
    if (!this.dir || !this.pending.length) return;
    const lines = this.pending.join('\n') + '\n';
    this.pending = [];
    try {
      const file = join(this.dir, `creatoros-${new Date().toISOString().slice(0, 10)}.log`);
      try {
        if (statSync(file).size + lines.length > MAX_FILE_BYTES) renameSync(file, `${file}.old`);
      } catch { /* file does not exist yet */ }
      appendFileSync(file, lines);
    } catch { /* disk failures must never crash the app */ }
  }

  private cleanupOldLogs() {
    if (!this.dir) return;
    try {
      const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600 * 1000;
      for (const name of readdirSync(this.dir)) {
        const match = /^creatoros-(\d{4}-\d{2}-\d{2})\.log(\.old)?$/.exec(name);
        if (!match) continue;
        if (new Date(`${match[1]}T00:00:00Z`).getTime() < cutoff) unlinkSync(join(this.dir, name));
      }
    } catch { /* best effort */ }
  }
}

export class Logger {
  constructor(private state: LoggerState = new LoggerState(), private module = 'app') {}

  /** Point the logger at a directory. Applies to the whole logger tree. Safe to call before app is ready. */
  init(dir: string) { this.state.init(dir); }

  /** A tagged child logger sharing the same ring buffer and file output. */
  child(module: string): Logger { return new Logger(this.state, module); }

  debug(message: string, meta?: unknown) { this.write('debug', message, meta); }
  info(message: string, meta?: unknown) { this.write('info', message, meta); }
  warn(message: string, meta?: unknown) { this.write('warn', message, meta); }
  error(message: string, meta?: unknown) { this.write('error', message, meta); }

  private write(level: LogLevel, message: string, meta?: unknown) {
    if (LEVELS[level] < levelThreshold()) return;
    const entry: LogEntry = { seq: ++this.state.seq, time: Date.now(), level, module: this.module, message, ...(meta !== undefined ? { meta } : {}) };
    const fileLine = JSON.stringify({ time: new Date(entry.time).toISOString(), level, module: this.module, message, ...(meta !== undefined ? { meta } : {}) });
    this.state.push(entry, fileLine);
    const line = `[${level}] (${this.module}) ${message}`;
    if (level === 'error') console.error(line, meta ?? '');
    else if (level === 'warn') console.warn(line, meta ?? '');
    else console.log(line, meta ?? '');
  }

  query(filter: LogFilter = {}): LogEntry[] {
    let rows = this.state.ring;
    if (filter.level) rows = rows.filter(r => r.level === filter.level);
    if (filter.module) rows = rows.filter(r => r.module === filter.module);
    if (filter.since) rows = rows.filter(r => r.time >= filter.since!);
    if (filter.search) {
      const needle = filter.search.toLowerCase();
      rows = rows.filter(r => r.message.toLowerCase().includes(needle) || (typeof r.meta === 'string' && r.meta.toLowerCase().includes(needle)));
    }
    const limit = Math.min(Math.max(filter.limit ?? 500, 1), RING_CAPACITY);
    return rows.slice(-limit);
  }

  modules(): string[] { return [...new Set(this.state.ring.map(r => r.module))].sort(); }

  clear() { this.state.ring = []; }
}

export const logger = new Logger();