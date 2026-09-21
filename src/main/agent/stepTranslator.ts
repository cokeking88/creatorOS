import type { AgentStep } from '../../shared/types.js';

/**
 * Translate one SDK stream message into UI-facing AgentStep(s).
 * Pure function — unit-tested without a real SDK connection.
 *
 * Rules:
 *  - assistant text block      -> { type: 'text', msgUuid: message uuid }
 *  - assistant tool_use block  -> { type: 'tool_start', tool, inputText } (+ pendingToolStart timestamp)
 *  - user tool_result block    -> { type: 'tool_result', tool, ok, detail, durationMs } (matched by tool_use_id)
 *  - stream_event text_delta   -> { type: 'text', isDelta: true, msgUuid }     (typewriter)
 *  - stream_event content_block_start(tool_use) -> { type: 'tool_start' } (earliest signal)
 *  - result success            -> { type: 'done', detail } — but is_error:true means the
 *                                 turn ended on an API error: translated to an error step instead
 *  - result non-success        -> { type: 'error', detail }
 *  - anything else             -> [] (system/init, compact boundaries, notifications...)
 */

export type TranslateState = {
  seq: number;
  /** tool_use_id -> tool name */
  pendingToolNames: Map<string, string>;
  /** tool_use_id -> start timestamp (for durationMs pairing) */
  pendingToolStart: Map<string, number>;
  runId: string;
  /** injectable clock — deterministic duration assertions in tests */
  now: () => number;
};

export function newTranslateState(runId: string, now: () => number = Date.now): TranslateState {
  return { seq: 0, pendingToolNames: new Map(), pendingToolStart: new Map(), runId, now };
}

export function translateSdkMessage(msg: unknown, state: TranslateState): AgentStep[] {
  const steps: AgentStep[] = [];
  const push = (s: Omit<AgentStep, 'seq' | 'time' | 'runId'>) => {
    steps.push({ ...s, seq: ++state.seq, time: state.now(), runId: state.runId });
  };
  const m = msg as Record<string, any>;

  if (m?.type === 'assistant') {
    const blocks: any[] = m.message?.content ?? [];
    for (const b of blocks) {
      if (b.type === 'text' && b.text) push({ type: 'text', text: b.text, msgUuid: typeof m.uuid === 'string' ? m.uuid : undefined });
      if (b.type === 'tool_use') {
        state.pendingToolNames.set(b.id, b.name);
        const startedAt = state.now();
        state.pendingToolStart.set(b.id, startedAt);
        push({ type: 'tool_start', tool: b.name, inputText: JSON.stringify(b.input).slice(0, 2000) });
      }
    }
    return steps;
  }

  if (m?.type === 'user') {
    const content = m.message?.content;
    const blocks: any[] = Array.isArray(content) ? content : [];
    for (const b of blocks) {
      if (b.type !== 'tool_result') continue;
      const toolName = state.pendingToolNames.get(b.tool_use_id) ?? b.tool_use_id ?? 'unknown';
      const startedAt = state.pendingToolStart.get(b.tool_use_id);
      state.pendingToolNames.delete(b.tool_use_id);
      state.pendingToolStart.delete(b.tool_use_id);
      const text = Array.isArray(b.content)
        ? b.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
        : String(b.content ?? '');
      const duration: { durationMs?: number } = {};
      if (startedAt !== undefined) duration.durationMs = Math.max(0, state.now() - startedAt);
      push({ type: 'tool_result', tool: toolName, ok: !b.is_error, detail: text.slice(0, 400), ...duration });
    }
    return steps;
  }

  if (m?.type === 'stream_event') {
    const event = m.event;
    if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
      const name = event.content_block.name;
      if (event.content_block.id) {
        state.pendingToolNames.set(event.content_block.id, name);
        state.pendingToolStart.set(event.content_block.id, state.now());
      }
      push({ type: 'tool_start', tool: name, inputText: '' });
    } else if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      push({ type: 'text', text: event.delta.text, isDelta: true, msgUuid: typeof m.uuid === 'string' ? m.uuid : undefined });
    }
    return steps;
  }

  if (m?.type === 'result') {
    if (m.subtype === 'success' && m.is_error === true) {
      // subtype success + is_error:true — the turn ended on an API error and result
      // carries the error text. Must NOT be translated into a green done row (G5).
      push({
        type: 'error',
        text: typeof m.result === 'string' ? m.result : '',
        detail: JSON.stringify({ subtype: m.subtype, isError: true, error: typeof m.result === 'string' ? m.result : null }),
      });
    } else if (m.subtype === 'success') {
      push({
        type: 'done',
        text: typeof m.result === 'string' ? m.result : '',
        detail: JSON.stringify({ subtype: m.subtype, cost: m.total_cost_usd ?? null, durationMs: m.duration_ms ?? null }),
      });
    } else {
      push({ type: 'error', detail: JSON.stringify({ subtype: m.subtype, error: m.error ?? null }) });
    }
    return steps;
  }

  return steps;
}

export function extractSessionId(msgs: unknown[]): string | null {
  for (const raw of msgs) {
    const m = raw as Record<string, any>;
    const sid = m?.session_id ?? m?.message?.session_id;
    if (typeof sid === 'string' && sid) return sid;
  }
  return null;
}
