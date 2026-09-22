import React,{useState} from 'react';
import type { AppState, JobRecord } from '../../shared/types';
import { parseCron, nextCronDate } from '../../shared/cronNext';
import { IcTrash } from '../components/icons';

const WORKFLOW_LABEL: Record<string, string> = { 'browser.navigate':'定时打开页面', 'agent.run':'执行 Agent 任务', 'demo':'演示任务' };
/** 模板下拉的 value 直接是可提交的 cron；__custom 保留用户手输。 */
const CRON_TEMPLATES = [
  { value: '0 9 * * *', label: '每天 09:00' },
  { value: '0 * * * *', label: '每小时' },
  { value: '0 9 * * 1', label: '每周一 09:00' },
] as const;

/** 下次运行预览：M月d日 HH:mm（本地时区）；无法解析/366 天内不触发各有专属文案。 */
function cronPreview(expr:string):string|null {
  const f=parseCron(expr);
  if(!f)return null;
  return (()=>{ const n=nextCronDate(f,new Date()); if(!n)return null; const d=new Date(n); return `下次运行：${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })();
}

/** 两段式删除确认：第一次点变「确认删除？」3s 恢复，第二次才执行 jobs.delete。 */
function DeleteJobButton({job,refresh}:{job:JobRecord;refresh:()=>void}) {
  const [confirming,setConfirming]=useState(false);
  const [timer,setTimer]=useState<ReturnType<typeof setTimeout>|null>(null);
  const click=async()=>{
    if(!confirming){ setConfirming(true); setTimer(setTimeout(()=>setConfirming(false),3000)); return; }
    if(timer)clearTimeout(timer);
    setConfirming(false);
    await window.creatorOS.jobs.delete(job.id);
    refresh();
  };
  return <button className="btn-danger" aria-label={`删除任务 ${job.name}`} title={`删除任务 ${job.name}`} onClick={click}>{confirming?'确认删除？':<IcTrash/>}</button>;
}

export function AutomationPage({state,refresh}:{state:AppState|null;refresh:()=>void}){
  const[name,setName]=useState('Open dashboard');
  const[cron,setCron]=useState('0 9 * * *');
  const[workflowType,setWorkflowType]=useState<'browser.navigate'|'demo'|'agent.run'>('browser.navigate');
  const[url,setUrl]=useState('https://www.google.com');
  const[prompt,setPrompt]=useState('');
  const promptMissing=workflowType==='agent.run'&&!prompt.trim();
  const templateValue=CRON_TEMPLATES.some(t=>t.value===cron)?cron:'__custom';
  const preview=cronPreview(cron);
  async function create(){
    if(promptMissing)return;
    const payload = workflowType==='browser.navigate' ? {url} : workflowType==='agent.run' ? {prompt} : {};
    await window.creatorOS.jobs.create({name,cron,workflowType,payload});
    refresh();
  }
  return <div className="page"><h1>自动化</h1><p className="muted">用 cron 定时执行打开页面或 Agent 任务。</p><div className="content-grid">
    <section className="panel"><h2>新建定时任务</h2>
      <label className="field-label" htmlFor="job-name">任务名</label>
      <input id="job-name" className="field" placeholder="如：每天早上打开创作中心" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="field-label" htmlFor="job-cron-template">执行周期</label>
      <select id="job-cron-template" className="field" value={templateValue} onChange={e=>{ if(e.target.value!=='__custom')setCron(e.target.value); }}>
        {CRON_TEMPLATES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        <option value="__custom">自定义</option>
      </select>
      {templateValue==='__custom'&&<input className="field" placeholder="cron 表达式，如 0 9 * * *" value={cron} onChange={e=>setCron(e.target.value)}/>}
      {preview
        ? <p className="muted cron-preview">{preview}</p>
        : parseCron(cron) ? <p className="muted cron-preview">366 天内不会触发</p> : <p className="muted cron-preview">无法预览该表达式</p>}
      <select className="field" value={workflowType} onChange={e=>setWorkflowType(e.target.value as typeof workflowType)}>
        <option value="browser.navigate">定时打开页面</option>
        <option value="agent.run">执行 Agent 任务（与聊天同一引擎）</option>
        <option value="demo">演示任务</option>
      </select>
      {workflowType==='browser.navigate' && <input className="field" placeholder="目标网址" value={url} onChange={e=>setUrl(e.target.value)}/>}
      {workflowType==='agent.run' && <textarea className="field" rows={12} placeholder="Agent 指令，如：打开小红书创作中心，检查登录状态并汇报" value={prompt} onChange={e=>setPrompt(e.target.value)}/>}
      {promptMissing && <p className="muted" style={{margin:'0 0 8px'}}>执行 Agent 任务需要填写指令</p>}
      <button className="btn-primary" disabled={promptMissing} onClick={create}>创建任务</button>
    </section>
    <section className="panel"><h2>定时任务</h2>{state?.jobs.map(j=><article className="content-item" key={j.id}><div><b>{j.name}</b><p><code>{j.cron}</code> · {WORKFLOW_LABEL[j.workflowType]??j.workflowType}</p>{j.workflowType==='agent.run' && <p className="muted">{String(j.payload.prompt??'').split('\n')[0].slice(0,80)}</p>}</div><div className="row"><label><input type="checkbox" checked={j.enabled} onChange={e=>window.creatorOS.jobs.toggle(j.id,e.target.checked).then(refresh)}/> 启用</label><DeleteJobButton job={j} refresh={refresh}/></div></article>)}</section>
  </div></div>;
}
