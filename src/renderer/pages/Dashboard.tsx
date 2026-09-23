import React,{useEffect,useState} from 'react'; import type { AppState, AgentRunsOverview } from '../../shared/types'; import { fmtCost, fmtDur, relTime } from '../../shared/format'; import { Empty } from '../components/Empty'; import { IcContent, IcAutomation } from '../components/icons';

export function Dashboard({state}:{state:AppState|null}) {
  const [runs,setRuns]=useState<AgentRunsOverview|null>(null);
  // App conditionally renders pages, so each mount is a fresh fetch (R2 §7.1) — no event subscription.
  useEffect(()=>{ void window.creatorOS.agent.runsList(10).then(setRuns); },[]);
  const profiles=state?.profiles??[]; const accounts=state?.accounts??[]; const contents=state?.contents??[]; const jobs=state?.jobs??[]; const skillsList=state?.skills??[];
  const activeJobs=jobs.filter(j=>j.enabled);
  const boundProfiles=profiles.filter(p=>p.accountId).length;
  const platforms=new Set(accounts.map(a=>a.platformId)).size;
  const today=new Date(); const todayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  const todayDrafts=contents.filter(c=>c.createdAt>=todayStart).length;
  const lastJobRun=activeJobs.map(j=>j.lastRunAt??null).filter((t):t is number=>t!==null).sort((a,b)=>b-a)[0]??null;
  const activeName=state?.profiles.find(p=>p.id===state.activeProfileId)?.name??'CreatorOS';
  const hour=today.getHours();
  const greet=hour<12?'上午好':hour<18?'下午好':'晚上好';
  const agentRuns=runs?.agentRuns??[]; const jobRuns=runs?.jobRuns??[];
  const lastSkillUpdate=skillsList.length?Math.max(...skillsList.map(s=>s.updatedAt)):null;
  return <div className="page">
    <header><h1>工作台</h1><p className="muted">{greet}，{activeName} · 共 {accounts.length} 个账号在线运营</p></header>
    <div className="cards">
      <div className="card"><strong>{profiles.length}</strong><span>浏览器身份</span><span className="sub">{boundProfiles}/{profiles.length} 已绑定</span></div>
      <div className="card"><strong>{accounts.length}</strong><span>运营账号</span><span className="sub">{platforms} 个平台</span></div>
      <div className="card"><strong>{contents.length}</strong><span>草稿</span><span className="sub">{todayDrafts} 篇今日新增</span></div>
      <div className="card"><strong>{activeJobs.length}</strong><span>启用中定时任务</span><span className="sub">{lastJobRun?`最近一次 ${relTime(lastJobRun)}`:'暂无运行记录'}</span></div>
      <div className="card"><strong>{skillsList.length}</strong><span>技能</span><span className="sub">{lastSkillUpdate?`更新于 ${relTime(lastSkillUpdate)}`:'还没有技能'}</span></div>
    </div>
    <div className="content-grid">
      <section className="panel"><h2>最近 Agent 运行</h2>
        {agentRuns.length?agentRuns.map(r=><article className="content-item" key={r.id}>
          <div><b>{r.prompt.length>60?`${r.prompt.slice(0,60)}…`:r.prompt}</b>
            <p>{r.source==='chat'?'对话':`定时任务「${r.source.slice('cron:'.length)}」`} · {relTime(r.startedAt)}{r.costUsd!==null?` · ${fmtCost(r.costUsd)}`:''}{r.durationMs!==null?` · ${fmtDur(r.durationMs)}`:''}</p>
            {!r.ok&&r.error&&<p className="content-item-error" title={r.error}>失败原因：{r.error.length>90?`${r.error.slice(0,90)}…`:r.error}</p>}</div>
          <span className={`pill ${r.ok?'ok':''}`}>{r.ok?'成功':'失败'}</span>
        </article>):<Empty icon={<IcAutomation/>} title="还没有 Agent 运行记录" hint="在右侧面板给 Agent 下第一条指令"/>}
      </section>
      <section className="panel"><h2>最近定时任务运行</h2>
        {jobRuns.length?jobRuns.slice(0,5).map(r=><article className="content-item" key={r.id}>
          <div><b>{r.jobName}</b>
            <p>{relTime(r.startedAt)}{r.finishedAt!==null?` · ${fmtDur(r.finishedAt-r.startedAt)}`:''}</p>
            {r.status!=='success'&&r.status!=='running'&&r.error&&<p className="content-item-error" title={r.error}>失败原因：{r.error.length>90?`${r.error.slice(0,90)}…`:r.error}</p>}</div>
          <span className={`pill ${r.status==='success'?'ok':''}`}>{r.status==='success'?'成功':r.status==='running'?'运行中':'失败'}</span>
        </article>):<Empty icon={<IcContent/>} title="还没有定时任务运行记录" hint="到「自动化」页创建第一个定时任务"/>}
      </section>
    </div>
  </div>;
}
