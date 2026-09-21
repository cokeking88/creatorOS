import { describe, expect, it } from 'vitest';
import { parseToolRequest } from '../src/main/agent/AgentRuntime.js';

describe('parseToolRequest', () => {
  it('parses plain JSON tool calls', () => {
    expect(parseToolRequest('{"tool":"navigate","args":{"url":"https://x.com"}}'))
      .toEqual({ tool: 'navigate', args: { url: 'https://x.com' } });
  });

  it('parses plain JSON final answers', () => {
    expect(parseToolRequest('{"final":"done"}')).toEqual({ final: 'done' });
  });

  it('strips ```json code fences', () => {
    expect(parseToolRequest('```json\n{"final":"fenced"}\n```')).toEqual({ final: 'fenced' });
    expect(parseToolRequest('```\n{"final":"bare fence"}\n```')).toEqual({ final: 'bare fence' });
  });

  it('extracts JSON embedded in prose', () => {
    expect(parseToolRequest('Let me take a snapshot first. {"tool":"snapshot","args":{}} ok'))
      .toEqual({ tool: 'snapshot', args: {} });
  });

  it('returns null for non-JSON replies', () => {
    expect(parseToolRequest('I cannot do that in plain text')).toBeNull();
    expect(parseToolRequest('{broken json')).toBeNull();
    expect(parseToolRequest('')).toBeNull();
  });
});
