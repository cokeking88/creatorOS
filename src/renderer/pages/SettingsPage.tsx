import React, { useEffect, useState } from 'react';
import type { AgentEngineConfig } from '../../shared/types';

export function SettingsPage() {
  const [cfg, setCfg] = useState<AgentEngineConfig>({});
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => { void window.creatorOS.settings.get().then((c) => { setCfg(c); setLoaded(true); }); }, []);

  const set = (patch: Partial<AgentEngineConfig>) => { setCfg((c) => ({ ...c, ...patch })); setSaved(null); };

  async function save() {
    const next = await window.creatorOS.settings.set(cfg);
    setCfg(next);
    setSaved('已保存并立即生效，无需重启');
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

  return <div className="page"><h1>设置</h1>
    <p className="muted">内置 Agent 引擎为 Claude Code（Agent SDK 子进程）。以下为 Anthropic 协议接入配置，保存即热生效。</p>
    <div className="content-grid">
      <section className="panel">
        <h2>Agent Engine · Claude Code</h2>
        <input className="field" placeholder="https://api.anthropic.com（默认）" value={cfg.baseUrl ?? ''} onChange={(e) => set({ baseUrl: e.target.value })} />
        <p className="help">公司网关地址填这里；留空走官方</p>
        <input className="field" type="password" placeholder="Auth Token（可选）" value={cfg.authToken ?? ''} onChange={(e) => set({ authToken: e.target.value })} />
        <p className="help">→ ANTHROPIC_AUTH_TOKEN（Bearer）；与 API Key 二选一，Token 优先</p>
        <input className="field" type="password" placeholder="API Key（可选）" value={cfg.apiKey ?? ''} onChange={(e) => set({ apiKey: e.target.value })} />
        <p className="help">→ ANTHROPIC_API_KEY（x-api-key）；与 Token 二选一，Token 优先</p>
        <input className="field" list="model-list" placeholder="如 claude-sonnet-4-5" value={cfg.model ?? ''} onChange={(e) => set({ model: e.target.value })} />
        <datalist id="model-list">
          <option value="claude-sonnet-4-5" />
          <option value="claude-opus-4-6" />
          <option value="claude-haiku-4-5" />
        </datalist>
        <p className="help">留空用默认模型</p>
        <div className="row">
          <button className="btn-primary" disabled={!loaded} onClick={save}>保存</button>
          <button className="btn-ghost" disabled={!loaded || testing} onClick={test}>{testing ? '测试中…' : '测试连接'}</button>
        </div>
        {saved && <p className="ok-msg">{saved}</p>}
        {testResult && <p className={testResult.ok ? 'ok-msg' : 'err-msg'}>
          {testResult.ok ? '✓ 引擎连通' : '✗ 连接失败'}
          {testResult.detail && <code className="test-detail">{testResult.detail}</code>}
        </p>}
      </section>
      <section className="panel">
        <h2>引擎说明</h2>
        <p className="muted">内核：<code>Claude Code Agent SDK</code>（每次运行 spawn 一个 claude CLI 子进程）</p>
        <p className="muted">浏览器工具：进程内 MCP server（<code>creatoros-browser</code>），与外部 MCP 桥同一套工具面。</p>
        <p className="muted">会话隔离：子进程的 <code>CLAUDE_CONFIG_DIR</code> 指向应用数据目录，不污染 ~/.claude。</p>
        <p className="muted">执行步骤（工具调用/文本流）实时推送到 Agent 面板，聊天与 Cron 共用同一事件流。</p>
      </section>
    </div>
  </div>;
}
