import { describe, expect, it } from 'vitest';
import { configFromEnv, createProviderFromConfig, MockProvider, type AgentProvider } from '../src/main/agent/providers.js';
import type { ProviderConfig } from '../src/shared/types.js';

describe('createProviderFromConfig', () => {
  it('defaults to mock', () => {
    expect(createProviderFromConfig({ provider: 'mock' }).name).toBe('mock');
  });

  it('anthropic requires a key, else falls back to mock', () => {
    expect(createProviderFromConfig({ provider: 'anthropic' }).name).toBe('mock');
    expect(createProviderFromConfig({ provider: 'anthropic', anthropicKey: 'sk-x' }).name).toBe('anthropic');
  });

  it('openai-compatible requires baseUrl + key + model, else falls back to mock', () => {
    const partial: ProviderConfig = { provider: 'openai-compatible', compatBaseUrl: 'https://gw/v1', compatKey: 'k' };
    expect(createProviderFromConfig(partial).name).toBe('mock'); // missing model
    const full: ProviderConfig = { ...partial, compatModel: 'm' };
    expect(createProviderFromConfig(full).name).toBe('openai-compatible');
  });
});

describe('configFromEnv', () => {
  it('maps env vars onto the config with defaults', () => {
    const prev = { ...process.env };
    try {
      process.env.CREATOROS_AGENT_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-env';
      delete process.env.ANTHROPIC_MODEL;
      const cfg = configFromEnv();
      expect(cfg.provider).toBe('anthropic');
      expect(cfg.anthropicKey).toBe('sk-env');
      expect(cfg.anthropicModel).toBeUndefined();
    } finally {
      process.env = prev;
    }
  });

  it('unknown provider kinds fall back to mock', () => {
    const prev = process.env.CREATOROS_AGENT_PROVIDER;
    process.env.CREATOROS_AGENT_PROVIDER = 'gpt-9000';
    try {
      expect(configFromEnv().provider).toBe('mock');
    } finally {
      if (prev === undefined) delete process.env.CREATOROS_AGENT_PROVIDER; else process.env.CREATOROS_AGENT_PROVIDER = prev;
    }
  });
});

describe('MockProvider', () => {
  it('returns a JSON final answer echoing the last message', async () => {
    const p: AgentProvider = new MockProvider();
    const raw = await p.complete([{ role: 'user', content: 'hello' }]);
    const parsed = JSON.parse(raw) as { final: string };
    expect(parsed.final).toContain('hello');
  });
});
