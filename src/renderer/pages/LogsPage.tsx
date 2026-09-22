import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LogEntry, LogLevel } from '../../shared/types';
import { IcReload, IcChevronRight, IcChevronDown } from '../components/icons';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function fmtTime(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  const [module, setModule] = useState('');
  const [search, setSearch] = useState('');
  const [auto, setAuto] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const refresh = useCallback(() => {
    void window.creatorOS.logs.list({
      ...(level ? { level: level as LogLevel } : {}),
      ...(module ? { module } : {}),
      ...(search ? { search } : {}),
      limit: 500,
    }).then((r) => { setEntries(r.entries); setModules(r.modules); });
  }, [level, module, search]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => { if (autoRef.current) refresh(); }, 2000);
    return () => clearInterval(t);
  }, [auto, refresh]);

  return <div className="page logs-page">
    <h1>日志</h1>
    <p className="muted">应用与 Agent 的运行记录，2 秒自动刷新。</p>
    <div className="logs-toolbar">
      <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
        <option value="">全部级别</option>
        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <select className="field" value={module} onChange={(e) => setModule(e.target.value)}>
        <option value="">全部模块</option>
        {modules.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <input className="field" placeholder="搜索消息…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自动刷新(2s)</label>
      <button className="btn-ghost" aria-label="刷新" title="刷新" onClick={refresh}><IcReload/></button>
      <button className="btn-ghost" onClick={() => { void window.creatorOS.logs.clear().then(refresh); }}>清空</button>
    </div>
    <div className="logs-table">
      <table>
        <thead><tr><th>时间</th><th>级别</th><th>模块</th><th>消息</th></tr></thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={4} className="muted logs-empty">暂无日志（级别阈值可通过 LOG_LEVEL 环境变量调整；debug 默认不落盘）</td></tr>}
          {entries.map((e) => (
            <tr key={e.seq} className={e.level} onClick={() => setExpanded(expanded === e.seq ? null : e.seq)}>
              <td className="logs-time">{fmtTime(e.time)}</td>
              <td><span className={`logs-dot ${e.level}`} />{e.level}</td>
              <td><code>{e.module}</code></td>
              <td>
                {e.message}
                {e.meta !== undefined && <div className="logs-meta">
                  {expanded === e.seq && JSON.stringify(e.meta, null, 2)}
                  <button className="btn-link" aria-label={expanded === e.seq ? '收起' : '详情'} onClick={(ev) => { ev.stopPropagation(); setExpanded(expanded === e.seq ? null : e.seq); }}>
                    {expanded === e.seq ? <><IcChevronDown/>收起</> : <><IcChevronRight/>详情</>}
                  </button>
                </div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}
