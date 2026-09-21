import type { AgentMessage, ProviderConfig } from '../../shared/types.js';

export interface AgentProvider {
  name: string;
  complete(messages: AgentMessage[]): Promise<string>;
}

export class MockProvider implements AgentProvider {
  name = 'mock';
  async complete(messages: AgentMessage[]) {
    const last = messages.at(-1)?.content ?? '';
    return JSON.stringify({ final: `Mock Agent 已收到：${last}\n\n你可以在 Settings 页面配置真实 provider。真实 provider 会通过内部工具循环操作 BrowserKernel，不会启动外部 Chrome。` });
  }
}

export class OpenAICompatibleProvider implements AgentProvider {
  name = 'openai-compatible';
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}
  async complete(messages: AgentMessage[]) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/,'')}/chat/completions`, { method:'POST', headers:{'content-type':'application/json','authorization':`Bearer ${this.apiKey}`}, body: JSON.stringify({ model:this.model, messages }) });
    if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json() as any;
    return json.choices?.[0]?.message?.content ?? '';
  }
}

export class AnthropicProvider implements AgentProvider {
  name = 'anthropic';
  constructor(private apiKey: string, private model: string) {}
  async complete(messages: AgentMessage[]) {
    const system = messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    const body = { model:this.model, max_tokens:2048, system, messages: messages.filter(m=>m.role!=='system').map(m=>({role:m.role,content:m.content})) };
    const res = await fetch('https://api.anthropic.com/v1/messages', { method:'POST', headers:{'content-type':'application/json','x-api-key':this.apiKey,'anthropic-version':'2023-06-01'}, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json() as any; return (json.content ?? []).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n');
  }
}

/** Build a provider from an explicit config. Falls back to mock when the chosen provider is incomplete. */
export function createProviderFromConfig(cfg: ProviderConfig): AgentProvider {
  if (cfg.provider === 'anthropic' && cfg.anthropicKey) return new AnthropicProvider(cfg.anthropicKey, cfg.anthropicModel ?? 'claude-sonnet-4-5');
  if (cfg.provider === 'openai-compatible' && cfg.compatBaseUrl && cfg.compatKey && cfg.compatModel) return new OpenAICompatibleProvider(cfg.compatBaseUrl, cfg.compatKey, cfg.compatModel);
  return new MockProvider();
}

/** Config from environment variables — the bootstrap default before anything is saved in Settings. */
export function configFromEnv(): ProviderConfig {
  const kind = process.env.CREATOROS_AGENT_PROVIDER ?? 'mock';
  return {
    provider: (kind === 'anthropic' || kind === 'openai-compatible') ? kind : 'mock',
    ...(process.env.ANTHROPIC_API_KEY ? { anthropicKey: process.env.ANTHROPIC_API_KEY } : {}),
    ...(process.env.ANTHROPIC_MODEL ? { anthropicModel: process.env.ANTHROPIC_MODEL } : {}),
    ...(process.env.OPENAI_COMPAT_BASE_URL ? { compatBaseUrl: process.env.OPENAI_COMPAT_BASE_URL } : {}),
    ...(process.env.OPENAI_COMPAT_API_KEY ? { compatKey: process.env.OPENAI_COMPAT_API_KEY } : {}),
    ...(process.env.OPENAI_COMPAT_MODEL ? { compatModel: process.env.OPENAI_COMPAT_MODEL } : {}),
  };
}