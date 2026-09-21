import { describe, expect, it } from 'vitest';
import { createStepBus, type AgentBusEvent } from '../src/main/agent/stepBus.js';
import type { AgentStep, AgentRunResult } from '../src/shared/types.js';

const step: AgentStep = { runId: 'r1', seq: 1, time: 1, type: 'tool_start', tool: 'browser_navigate' };
const done: AgentRunResult = { runId: 'r1', sessionId: 's1', ok: true, text: 'hi', stepCount: 1 };

const evStep: AgentBusEvent = { kind: 'step', step };
const evDone: AgentBusEvent = { kind: 'done', result: done };

describe('createStepBus', () => {
  it('starts empty and subscribe/size track each other', () => {
    const bus = createStepBus();
    expect(bus.size).toBe(0);
    const off = bus.subscribe(() => {});
    expect(bus.size).toBe(1);
    off();
    expect(bus.size).toBe(0);
  });

  it('fans out to every subscriber and returns the exact event objects', () => {
    const bus = createStepBus();
    const seenA: AgentBusEvent[] = [];
    const seenB: AgentBusEvent[] = [];
    bus.subscribe((e) => seenA.push(e));
    bus.subscribe((e) => seenB.push(e));
    bus.publish(evStep);
    bus.publish(evDone);
    expect(seenA).toEqual([evStep, evDone]);
    expect(seenB).toEqual([evStep, evDone]);
  });

  it('a throwing subscriber is swallowed and does not block the others', () => {
    const bus = createStepBus();
    const seen: AgentBusEvent[] = [];
    let boomCalls = 0;
    bus.subscribe(() => { boomCalls++; throw new Error('subscriber bug'); });
    const healthy = bus.subscribe((e) => seen.push(e));
    expect(() => bus.publish(evStep)).not.toThrow();
    expect(boomCalls).toBe(1);
    expect(seen).toEqual([evStep]);
    // The bus stays usable and the healthy subscriber keeps receiving.
    bus.publish(evDone);
    expect(seen).toEqual([evStep, evDone]);
    expect(bus.size).toBe(2);
    expect(healthy).toBeTypeOf('function');
  });

  it('unsubscribed handlers receive nothing afterwards and can be unsubscribed twice safely', () => {
    const bus = createStepBus();
    const seen: AgentBusEvent[] = [];
    const off = bus.subscribe((e) => seen.push(e));
    off();
    off(); // idempotent — Set.delete on a missing key is a no-op
    bus.publish(evStep);
    expect(seen).toHaveLength(0);
    expect(bus.size).toBe(0);
  });

  it('publishing with zero subscribers is a no-op', () => {
    const bus = createStepBus();
    expect(() => bus.publish(evStep)).not.toThrow();
    expect(bus.size).toBe(0);
  });
});
