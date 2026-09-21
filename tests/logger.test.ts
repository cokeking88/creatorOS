import { describe, expect, it } from 'vitest';
import { Logger } from '../src/main/services/logger.js';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function tmpDir() { return mkdtempSync(join(tmpdir(), 'creatoros-ut-')); }

describe('Logger', () => {
  it('ring buffer keeps entries and respects capacity', () => {
    const log = new Logger();
    for (let i = 0; i < 2500; i++) log.info(`m${i}`);
    const all = log.query({ limit: 3000 });
    expect(all.length).toBe(2000);            // capacity cap
    expect(all[0].message).toBe('m500');       // oldest evicted
    expect(all[all.length - 1].message).toBe('m2499');
  });

  it('child loggers share one ring buffer with module tags', () => {
    const log = new Logger();
    const browser = log.child('browser');
    log.info('from root');
    browser.warn('from child');
    expect(log.query({ module: 'browser' })).toHaveLength(1);
    expect(log.query({ module: 'browser' })[0].message).toBe('from child');
    expect(log.modules()).toEqual(['app', 'browser']);
  });

  it('query filters by level, search and since', () => {
    const log = new Logger();
    log.debug('debug should be filtered by default threshold');
    log.info('navigate to google');
    log.error('boom happened');
    expect(log.query({ level: 'error' })).toHaveLength(1);
    expect(log.query({ search: 'boom' })[0].level).toBe('error');
    expect(log.query({ search: 'navigate' })).toHaveLength(1);
    const since = Date.now() + 10_000;
    expect(log.query({ since })).toHaveLength(0);
  });

  it('LOG_LEVEL=debug opens the debug channel', () => {
    const prev = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'debug';
    try {
      const log = new Logger();
      log.debug('now visible');
      expect(log.query({ level: 'debug' })).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env.LOG_LEVEL; else process.env.LOG_LEVEL = prev;
    }
  });

  it('writes to daily file and clear() empties the ring', () => {
    const dir = tmpDir();
    try {
      const log = new Logger();
      log.init(dir);
      log.info('persisted line');
      log.close(); // flush now
      const files = readdirSync(dir);
      expect(files.some((f) => /^creatoros-\d{4}-\d{2}-\d{2}\.log$/.test(f))).toBe(true);
      const file = files.find((f) => f.endsWith('.log'))!;
      const content = readFileSync(join(dir, file), 'utf8');
      expect(content).toContain('persisted line');
      log.clear();
      expect(log.query()).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
