import React,{useState} from 'react';
import type { AppState } from '../../shared/types';

export function AutomationPage({state,refresh}:{state:AppState|null;refresh:()=>void}){
  const[name,setName]=useState('Open dashboard');
  const[cron,setCron]=useState('0 9 * * *');
  const[workflowType,setWorkflowType]=useState<'browser.navigate'|'demo'|'agent.run'>('browser.navigate');
  const[url,setUrl]=useState('https://www.google.com');
  const[prompt,setPrompt]=useState('');
  const promptMissing=workflowType==='agent.run'&&!prompt.trim();
  async function create(){
    if(promptMissing)return;
    const payload = workflowType==='browser.navigate' ? {url} : workflowType==='agent.run' ? {prompt} : {};
    await window.creatorOS.jobs.create({name,cron,workflowType,payload});
    refresh();
  }
  return <div className="page"><h1>Automation</h1><div className="content-grid">
    <section className="panel"><h2>Create cron job</h2>
      <input className="field" placeholder="Job name" value={name} onChange={e=>setName(e.target.value)}/>
      <input className="field" placeholder="Cron (e.g. 0 9 * * *)" value={cron} onChange={e=>setCron(e.target.value)}/>
      <select className="field" value={workflowType} onChange={e=>setWorkflowType(e.target.value as typeof workflowType)}>
        <option value="browser.navigate">browser.navigate — 定时打开指定页面</option>
        <option value="agent.run">agent.run — 由 Claude Code Agent 执行 prompt（与聊天同一引擎）</option>
        <option value="demo">demo — 演示工作流</option>
      </select>
      {workflowType==='browser.navigate' && <input className="field" placeholder="Target URL" value={url} onChange={e=>setUrl(e.target.value)}/>}
      {workflowType==='agent.run' && <textarea className="field" rows={5} placeholder="Agent prompt，如：打开小红书创作中心，检查登录状态并汇报" value={prompt} onChange={e=>setPrompt(e.target.value)}/>}
      {promptMissing && <p className="muted" style={{margin:'0 0 8px'}}>agent.run 需要填写 prompt</p>}
      <button className="primary" disabled={promptMissing} onClick={create}>Create</button>
    </section>
    <section className="panel"><h2>Jobs</h2>{state?.jobs.map(j=><article className="content-item" key={j.id}><div><b>{j.name}</b><p><code>{j.cron}</code> · {j.workflowType}</p>{j.workflowType==='agent.run' && <p className="muted">{String(j.payload.prompt??'').split('\n')[0].slice(0,80)}</p>}</div><label><input type="checkbox" checked={j.enabled} onChange={e=>window.creatorOS.jobs.toggle(j.id,e.target.checked).then(refresh)}/> enabled</label></article>)}</section>
  </div></div>;
}
