import { describe, expect, it, vi } from 'vitest';
import { RunRegistry, type ActiveRun } from '../src/main/agent/runRegistry.js';

/** ActiveRun double: vi.fn() records the two-phase stop call order. */
function fakeRun(): ActiveRun & { interrupt: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> } {
  return { interrupt: vi.fn(), abort: vi.fn() };
}

describe('RunRegistry', () => {
  it('registers, exposes has(), and unregisters', () => {
    const reg = new RunRegistry();
    const run = fakeRun();
    expect(reg.has('r1')).toBe(false);
    reg.register('r1', run);
    expect(reg.has('r1')).toBe(true);
    reg.unregister('r1');
    expect(reg.has('r1')).toBe(false);
  });

  it('stop() calls interrupt then abort (two-phase), in order', () => {
    const reg = new RunRegistry();
    const run = fakeRun();
    reg.register('r1', run);
    expect(reg.stop('r1')).toBe(true);
    expect(run.interrupt).toHaveBeenCalledTimes(1);
    expect(run.abort).toHaveBeenCalledTimes(1);
    // Exact call order, via a call-order probe on a second registry.
    const calls: string[] = [];
    const probe = new RunRegistry();
    probe.register('p1', { interrupt: () => calls.push('interrupt'), abort: () => calls.push('abort') });
    probe.stop('p1');
    expect(calls).toEqual(['interrupt', 'abort']);
  });

  it('stop() on an unknown runId returns false and touches nothing', () => {
    const reg = new RunRegistry();
    expect(reg.stop('nope')).toBe(false);
  });

  it('stop() returns false after the run was unregistered', () => {
    const reg = new RunRegistry();
    const run = fakeRun();
    reg.register('r1', run);
    reg.unregister('r1');
    expect(reg.stop('r1')).toBe(false);
    expect(run.interrupt).not.toHaveBeenCalled();
    expect(run.abort).not.toHaveBeenCalled();
  });

  it('stop() still aborts when interrupt() throws (interrupt errors are swallowed)', () => {
    const reg = new RunRegistry();
    const abort = vi.fn();
    reg.register('r1', { interrupt: () => { throw new Error('query already closed'); }, abort });
    expect(reg.stop('r1')).toBe(true);
    expect(abort).toHaveBeenCalledTimes(1);
  });

  it('a second stop() of the same runId no-ops after unregister — one interrupt+abort per run', () => {
    const reg = new RunRegistry();
    const run = fakeRun();
    reg.register('r1', run);
    reg.stop('r1');
    // streamRun unregisters in its finally block; a late duplicate stop must return false.
    reg.unregister('r1');
    expect(reg.stop('r1')).toBe(false);
    expect(run.interrupt).toHaveBeenCalledTimes(1);
    expect(run.abort).toHaveBeenCalledTimes(1);
  });

  it('independent runIds are isolated', () => {
    const reg = new RunRegistry();
    const a = fakeRun();
    const b = fakeRun();
    reg.register('a', a);
    reg.register('b', b);
    expect(reg.stop('a')).toBe(true);
    expect(a.abort).toHaveBeenCalledTimes(1);
    expect(b.abort).not.toHaveBeenCalled();
    expect(reg.has('b')).toBe(true);
  });
});
