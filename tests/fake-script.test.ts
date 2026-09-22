import { describe, expect, it } from 'vitest';
import { buildFakeScript, fakeSessionId } from '../src/main/agent/fakeScript.js';
import { translateSdkMessage, newTranslateState } from '../src/main/agent/stepTranslator.js';

/** Translate the whole scripted sequence through the real translator (same path as runFake). */
function translateAll(script: unknown[], runId: string) {
  const state = newTranslateState(runId);
  return script.flatMap((msg) => translateSdkMessage(msg, state));
}

describe('fakeSessionId', () => {
  it('defaults to fake-session-<runId>', () => {
    expect(fakeSessionId({ runId: 'run-1', prompt: 'p' })).toBe('fake-session-run-1');
  });

  it('echoes resumeSessionId when provided (AC4 passthrough)', () => {
    expect(fakeSessionId({ runId: 'run-2', prompt: 'p', resumeSessionId: 'fake-session-run-1' })).toBe('fake-session-run-1');
    expect(fakeSessionId({ runId: 'run-2', prompt: 'p', resumeSessionId: null })).toBe('fake-session-run-2');
  });
});

describe('buildFakeScript', () => {
  it('returns the 4-message scripted sequence (tool_use -> tool_result -> assistant text -> result)', () => {
    const script = buildFakeScript({ runId: 'r9', prompt: 'check drafts' });
    expect(script).toHaveLength(4);
    expect((script[0] as { type: string }).type).toBe('assistant');
    expect((script[1] as { type: string }).type).toBe('user');
    expect((script[2] as { type: string }).type).toBe('assistant');
    expect((script[3] as { type: string }).type).toBe('result');
  });

  it('first assistant message carries the browser tool_use with the expected name and url', () => {
    const script = buildFakeScript({ runId: 'r9', prompt: 'p' });
    const first = script[0] as { message: { content: Array<Record<string, unknown>> } };
    const toolUse = first.message.content[0];
    expect(toolUse.type).toBe('tool_use');
    expect(toolUse.name).toBe('mcp__creatoros-browser__browser_navigate');
    expect((toolUse.input as { url: string }).url).toBe('https://example.com');
    expect(toolUse.id).toBe('tu1');
  });

  it('result message reports success with the session id and echoed prompt text', () => {
    const script = buildFakeScript({ runId: 'r9', prompt: 'publish draft 1' });
    const result = script[3] as Record<string, unknown>;
    expect(result.subtype).toBe('success');
    expect(result.is_error).toBe(false);
    expect(result.result).toContain('publish draft 1');
    expect(result.session_id).toBe('fake-session-r9');
  });

  it('resumeSessionId is passed through to every message that carries a session id', () => {
    const script = buildFakeScript({ runId: 'r2', prompt: 'p', resumeSessionId: 'prev-session' });
    expect(fakeSessionId({ runId: 'r2', prompt: 'p', resumeSessionId: 'prev-session' })).toBe('prev-session');
    expect((script[0] as { session_id: string }).session_id).toBe('prev-session');
    expect((script[2] as { session_id: string }).session_id).toBe('prev-session');
    expect((script[3] as { session_id: string }).session_id).toBe('prev-session');
  });

  it('assistant messages carry distinct top-level uuids (msgUuid grouping keys)', () => {
    const script = buildFakeScript({ runId: 'r3', prompt: 'p' });
    const u1 = (script[0] as { uuid: string }).uuid;
    const u2 = (script[2] as { uuid: string }).uuid;
    expect(u1).toBe('fake-msg-r3-1');
    expect(u2).toBe('fake-msg-r3-2');
    expect(u1).not.toBe(u2);
  });
});

describe('fakeScript through the real stepTranslator (AC1 offline face)', () => {
  it('translates to >=4 steps in order tool_start -> tool_result -> text -> done with monotonic seq and one runId', () => {
    const steps = translateAll(buildFakeScript({ runId: 'run-x', prompt: 'open dashboard' }), 'run-x');
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.map((s) => s.type)).toEqual(['tool_start', 'tool_result', 'text', 'done']);
    const seqs = steps.map((s) => s.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length); // strictly monotonic (no dupes)
    for (const s of steps) expect(s.runId).toBe('run-x');
  });

  it('tool_start names the browser tool and carries serialized input; tool_result is ok:true with detail and durationMs', () => {
    const steps = translateAll(buildFakeScript({ runId: 'run-x', prompt: 'p' }), 'run-x');
    const [start, result, , doneStep] = steps;
    expect(start.tool).toBe('mcp__creatoros-browser__browser_navigate');
    expect(start.inputText).toContain('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('"ok":true');
    // pendingToolStart pairing: the scripted tool_use is translated right before
    // the tool_result, so durationMs is present (>= 0, clock-derived).
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    const doneDetail = JSON.parse(doneStep.detail!) as { subtype: string; cost: number; durationMs: number };
    expect(doneDetail).toEqual({ subtype: 'success', cost: 0, durationMs: 42 });
  });

  it('text step echoes the prompt and carries the assistant message uuid', () => {
    const steps = translateAll(buildFakeScript({ runId: 'run-x', prompt: 'summarize stats' }), 'run-x');
    const text = steps.find((s) => s.type === 'text')!;
    expect(text.text).toContain('summarize stats');
    expect(text.isDelta).toBeUndefined(); // full text, not a delta
    expect(text.msgUuid).toBe('fake-msg-run-x-2');
  });
});
