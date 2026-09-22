/**
 * Deterministic offline message script for CREATOROS_FAKE_CLAUDE=1 mode.
 * Pure data — the service loops over it and feeds every message through the
 * same stepTranslator as a real SDK run, so fake steps carry the same
 * source/msgUuid/durationMs fields (arch spec §3.7).
 *
 * Message shapes fixed against @anthropic-ai/claude-agent-sdk 0.3.278:
 * assistant messages carry top-level uuid/session_id; tool results come back
 * on a user message; the turn ends with a result message (subtype success).
 */

export type FakeScriptOptions = {
  runId: string;
  prompt: string;
  /** Resume passthrough: echoes the previous session so E2E can assert the two-run session_id relation (AC4). */
  resumeSessionId?: string | null;
};

/** The session id the fake run reports. Resume keeps the previous session's id, like the real SDK. */
export function fakeSessionId(opts: FakeScriptOptions): string {
  return opts.resumeSessionId ?? `fake-session-${opts.runId}`;
}

/** The scripted message sequence: tool_use -> tool_result -> assistant text -> result. */
export function buildFakeScript(opts: FakeScriptOptions): unknown[] {
  const sessionId = fakeSessionId(opts);
  const text = opts.resumeSessionId
    ? `继续处理：${opts.prompt}`
    : `已完成「${opts.prompt}」：打开 example.com 并读取页面内容。页面标题为 Example Domain，正文包含一个指向 iana.org 的链接。登录态正常，无需重新授权。`;
  return [
    {
      type: 'assistant',
      uuid: `fake-msg-${opts.runId}-1`,
      session_id: sessionId,
      message: { content: [{ type: 'tool_use', id: 'tu1', name: 'mcp__creatoros-browser__browser_navigate', input: { url: 'https://example.com' } }] },
    },
    {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '{"ok":true}' }], is_error: false }] },
    },
    {
      type: 'assistant',
      uuid: `fake-msg-${opts.runId}-2`,
      session_id: sessionId,
      message: { content: [{ type: 'text', text }] },
    },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: text,
      total_cost_usd: 0,
      duration_ms: 42,
      session_id: sessionId,
    },
  ];
}
