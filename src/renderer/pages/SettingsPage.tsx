import React, { useEffect, useState } from 'react';
import type { ProviderConfig, ProviderTestResult } from '../../shared/types';

export function SettingsPage() {
  const [cfg, setCfg] = useState<ProviderConfig>({ provider: 'mock' });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);

  useEffect(() => { void window.creatorOS.settings.get().then((c) => { setCfg(c); setLoaded(true); }); }, []);

  const set = (patch: Partial<ProviderConfig>) => { setCfg((c) => ({ ...c, ...patch })); setSaved(null); };

  async function save() {
    const next = await window.creatorOS.settings.set(cfg);
    setCfg(next);
    setSaved(`已保存并立即生效（provider: ${next.provider}），无需重启`);
    setTestResult(null);
  }

  async function test() {
    setTesting(true); setTestResult(null);
    try {
      await window.creatorOS.settings.set(cfg);
      const r = await window.creatorOS.settings.testProvider();
      setTestResult(r);
    } finally { setTesting(false); }
  }

  return <div className="page"><h1>Settings</h1>
    <p className="muted">LLM provider configuration. Saved config applies to the Agent panel immediately — no restart needed. Stored locally in SQLite.</p>
    <div className="content-grid">
      <section className="panel">
        <h2>Agent Provider</h2>
        <select className="field" value={cfg.provider} onChange={(e) => set({ provider: e.target.value as ProviderConfig['provider'] })}>
          <option value="mock">mock（无需 API Key）</option>
          <option value="anthropic">Anthropic（Claude）</option>
          <option value="openai-compatible">OpenAI-compatible 网关</option>
        </select>

        {cfg.provider === 'anthropic' && <>
          <input className="field" type="password" placeholder="ANTHROPIC_API_KEY" value={cfg.anthropicKey ?? ''} onChange={(e) => set({ anthropicKey: e.target.value })} />
          <input className="field" placeholder="Model（默认 claude-sonnet-4-5）" value={cfg.anthropicModel ?? ''} onChange={(e) => set({ anthropicModel: e.target.value })} />
        </>}

        {cfg.provider === 'openai-compatible' && <>
          <input className="field" placeholder="Base URL（如 https://gateway.example/v1）" value={cfg.compatBaseUrl ?? ''} onChange={(e) => set({ compatBaseUrl: e.target.value })} />
          <input className="field" type="password" placeholder="API Key" value={cfg.compatKey ?? ''} onChange={(e) => set({ compatKey: e.target.value })} />
          <input className="field" placeholder="Model 名称" value={cfg.compatModel ?? ''} onChange={(e) => set({ compatModel: e.target.value })} />
        </>}

        <div className="row">
          <button className="primary" disabled={!loaded} onClick={save}>Save</button>
          <button disabled={!loaded || testing} onClick={test}>{testing ? 'Testing…' : 'Test connection'}</button>
        </div>
        {saved && <p className="ok-msg">{saved}</p>}
        {testResult && <p className={testResult.ok ? 'ok-msg' : 'err-msg'}>
          {testResult.ok ? '✓ 连接成功' : '✗ 连接失败'} · {testResult.provider}
          {testResult.detail && <code className="test-detail">{testResult.detail.slice(0, 300)}</code>}
        </p>}
      </section>
      <section className="panel">
        <h2>当前生效配置</h2>
        <p className="muted">Provider：<code>{loaded ? cfg.provider : '加载中…'}</code></p>
        <p className="muted">优先级：Settings 保存的配置 &gt; 环境变量（.env）。</p>
        <p className="muted">Key 明文存储于本地 SQLite（个人本地工具取舍）；后续可升级为 macOS Keychain（safeStorage）。</p>
        <p className="muted">环境变量仍作为首次启动的默认值生效。</p>
      </section>
    </div>
  </div>;
}