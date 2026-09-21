import { describe, expect, it } from 'vitest';
import { translateSdkMessage, newTranslateState, extractSessionId } from '../src/main/agent/stepTranslator.js';

describe('translateSdkMessage', () => {
  it('assistant text block -> text step with msgUuid', () => {
    const st = newTranslateState('r1');
    const steps = translateSdkMessage({ type: 'assistant', uuid: 'msg-1', message: { content: [{ type: 'text', text: 'hello' }] } }, st);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'text', text: 'hello', runId: 'r1', seq: 1, msgUuid: 'msg-1' });
  });

  it('assistant text without uuid leaves msgUuid undefined (fake/old shape)', () => {
    const st = newTranslateState('r1');
    const steps = translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }, st);
    expect(steps[0].msgUuid).toBeUndefined();
  });

  it('assistant tool_use -> tool_start with serialized input', () => {
    const st = newTranslateState('r1');
    const steps = translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'browser_click', input: { ref: 'e1' } }] } }, st);
    expect(steps[0]).toMatchObject({ type: 'tool_start', tool: 'browser_click' });
    expect(steps[0].inputText).toContain('"ref":"e1"');
  });

  it('user tool_result matches the pending tool name and success flag', () => {
    const st = newTranslateState('r1');
    translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'browser_snapshot', input: {} }] } }, st);
    const steps = translateSdkMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '{"url":"https://x"}' }], is_error: false }] } }, st);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'tool_result', tool: 'browser_snapshot', ok: true });
    expect(steps[0].detail).toContain('https://x');
  });

  it('tool_result carries durationMs via the injectable clock', () => {
    let t = 1_000;
    const st = newTranslateState('r1', () => t);
    translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'browser_navigate', input: {} }] } }, st);
    t = 3_100; // 2.1s later
    const steps = translateSdkMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok', is_error: false }] } }, st);
    expect(steps[0]).toMatchObject({ type: 'tool_result', durationMs: 2_100 });
    // Missing pairing (no tool_use seen) omits durationMs instead of guessing.
    const orphan = translateSdkMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu-x', content: 'ok', is_error: false }] } }, st);
    expect(orphan[0].durationMs).toBeUndefined();
  });

  it('failed tool_result carries ok:false', () => {
    const st = newTranslateState('r1');
    translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu9', name: 'browser_click', input: { ref: 'zz' } }] } }, st);
    const steps = translateSdkMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu9', content: [{ type: 'text', text: 'ref not found' }], is_error: true }] } }, st);
    expect(steps[0]).toMatchObject({ type: 'tool_result', tool: 'browser_click', ok: false });
  });

  it('stream_event text_delta -> delta step with msgUuid; tool_use block_start -> early tool_start', () => {
    const st = newTranslateState('r1');
    const deltas = translateSdkMessage({ type: 'stream_event', uuid: 'msg-2', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'abc' } } }, st);
    expect(deltas[0]).toMatchObject({ type: 'text', text: 'abc', isDelta: true, msgUuid: 'msg-2' });
    const starts = translateSdkMessage({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', id: 'tb1', name: 'browser_navigate' } } }, st);
    expect(starts[0]).toMatchObject({ type: 'tool_start', tool: 'browser_navigate' });
    // And the pending map lets a later tool_result resolve the name.
    const result = translateSdkMessage({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tb1', content: 'ok', is_error: false }] } }, st);
    expect(result[0]).toMatchObject({ tool: 'browser_navigate', ok: true });
  });

  it('result success -> done with cost/duration; error subtype -> error step', () => {
    const st = newTranslateState('r1');
    const done = translateSdkMessage({ type: 'result', subtype: 'success', is_error: false, result: 'all done', total_cost_usd: 0.0123, duration_ms: 4200 }, st);
    expect(done[0]).toMatchObject({ type: 'done', text: 'all done' });
    expect(JSON.parse(done[0].detail!)).toEqual({ subtype: 'success', cost: 0.0123, durationMs: 4200 });
    const err = translateSdkMessage({ type: 'result', subtype: 'error_max_turns', error: 'too many' }, st);
    expect(err[0].type).toBe('error');
  });

  it('result success with is_error:true is an error step, not a green done row', () => {
    const st = newTranslateState('r1');
    const steps = translateSdkMessage({ type: 'result', subtype: 'success', is_error: true, result: 'API error text', total_cost_usd: 0, duration_ms: 500 }, st);
    expect(steps[0].type).toBe('error');
    expect(steps[0].text).toBe('API error text');
    expect(JSON.parse(steps[0].detail!)).toEqual({ subtype: 'success', isError: true, error: 'API error text' });
  });

  it('system/init and unknown messages produce no steps; seq increments monotonically', () => {
    const st = newTranslateState('r1');
    expect(translateSdkMessage({ type: 'system', subtype: 'init' }, st)).toHaveLength(0);
    expect(translateSdkMessage({ type: 'stream_event', event: { type: 'message_start' } }, st)).toHaveLength(0);
    translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'text', text: 'a' }] } }, st);
    translateSdkMessage({ type: 'assistant', message: { content: [{ type: 'text', text: 'b' }] } }, st);
    expect(st.seq).toBe(2);
  });
});

describe('extractSessionId', () => {
  it('finds session_id on any message', () => {
    expect(extractSessionId([{ type: 'system' }, { type: 'result', session_id: 's-123' }])).toBe('s-123');
    expect(extractSessionId([{ type: 'system' }])).toBeNull();
  });
});
