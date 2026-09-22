import React,{useState} from 'react';
import type { AppState } from '../../shared/types';
import { parseCron } from '../../shared/cronNext';
import { CRON_TEMPLATES, cronPreview } from '../../shared/cronPreview';
import { ConfirmButton } from '../components/ConfirmButton';

const WORKFLOW_LABEL: Record<string, string> = { 'browser.navigate':'定时打开页面', 'agent.run':'执行 Agent 任务', 'demo':'演示任务' };
/** §12.3: bound-skill dangling pill copy is the same text the Scheduler writes to job_runs.error (§12.5 #25). */
const DANGLING_SKILL_TITLE = '绑定的技能已被删除，请重新配置或删除该任务';

export function AutomationPage({state,refresh}:{state:AppState|null;refresh:()=>void}){
  const[name,setName]=useState('Open dashboard');
  const[cron,setCron]=useState('0 9 * * *');
  const[workflowType,setWorkflowType]=useState<'browser.navigate'|'demo'|'agent.run'>('browser.navigate');
  const[url,setUrl]=useState('https://www.google.com');
  const[prompt,setPrompt]=useState('');
  const[useSkill,setUseSkill]=useState(false);
  const[skillId,setSkillId]=useState('');
  const[createErr,setCreateErr]=useState<string|null>(null);
  const skills=state?.skills??[];
  const boundSkill=skills.find(s=>s.id===skillId)??null;
  // promptMissing logic generalized to contentMissing (§12.3): whichever mode is
  // active must have its content; both branches share the same disabled+hint gate.
  const contentMissing=workflowType==='agent.run'&&(useSkill?!boundSkill:!prompt.trim());
  const templateValue=CRON_TEMPLATES.some(t=>t.value===cron)?cron:'__custom';
  const preview=cronPreview(cron);
  const cronInvalid=!parseCron(cron);
  async function create(){
    if(contentMissing||cronInvalid)return;
    setCreateErr(null);
    // §2.4 payload shape: both keys persisted, exactly one non-null (skillId reference semantics).
    const payload = workflowType==='browser.navigate' ? {url} : workflowType==='agent.run' ? (useSkill?{skillId:boundSkill!.id,prompt:null}:{prompt,skillId:null}) : {};
    try{
      await window.creatorOS.jobs.create({name,cron,workflowType,payload});
      refresh();
    }catch(e){ setCreateErr(`创建失败：${String(e).replace(/^Error: /,'')}`); }
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
      {workflowType==='agent.run' && <>
        <div className="seg" role="radiogroup" aria-label="任务内容来源">
          <button type="button" className={`seg-opt${!useSkill?' active':''}`} role="radio" aria-checked={!useSkill} onClick={()=>setUseSkill(false)}>写指令</button>
          <button type="button" className={`seg-opt${useSkill?' active':''}`} role="radio" aria-checked={useSkill} onClick={()=>setUseSkill(true)}>选技能</button>
        </div>
        {!useSkill
          ? <textarea className="field" rows={12} placeholder="Agent 指令，如：打开小红书创作中心，检查登录状态并汇报" value={prompt} onChange={e=>setPrompt(e.target.value)}/>
          : <>
              <select className="field" aria-label="选择技能" value={skillId} onChange={e=>setSkillId(e.target.value)}>
                <option value="">选择一个技能…</option>
                {skills.map(s=><option key={s.id} value={s.id}>{s.name}{s.description?` — ${s.description}`:''}</option>)}
              </select>
              {boundSkill?.origin==='agent' && <p className="help">该技能由 Agent 生成，请先确认模板内容</p>}
              {!skills.length && <p className="help">还没有技能，去「技能」页创建或对话里让 Agent 沉淀</p>}
            </>}
        {contentMissing && <p className="muted" style={{margin:'0 0 8px'}}>{useSkill?'请选择一个技能':'执行 Agent 任务需要填写指令'}</p>}
      </>}
      <button className="btn-primary" disabled={contentMissing||cronInvalid} title={contentMissing?(useSkill?'请选择一个技能':'执行 Agent 任务需要填写指令'):'无法预览该表达式：cron 无效'} onClick={()=>void create()}>创建任务</button>
      {createErr&&<p className="err-msg">{createErr}</p>}
    </section>
    <section className="panel"><h2>定时任务</h2>{state?.jobs.map(j=>{
      const p=j.payload as {prompt?:unknown;skillId?:unknown};
      const bound=typeof p.skillId==='string'&&p.skillId?state.skills.find(s=>s.id===p.skillId)??null:null;
      const dangling=typeof p.skillId==='string'&&p.skillId&&!bound;
      return <article className="content-item" key={j.id}><div><b>{j.name}</b><p><code>{j.cron}</code> · {WORKFLOW_LABEL[j.workflowType]??j.workflowType}</p>{j.workflowType==='agent.run'&&(dangling
        ? <span className="pill warn" title={DANGLING_SKILL_TITLE}>技能已删除</span>
        : bound ? <p className="muted">技能：{bound.name}</p> : <p className="muted">{String(p.prompt??'').split('\n')[0].slice(0,80)}</p>)}</div><div className="row"><label><input type="checkbox" checked={j.enabled} onChange={e=>window.creatorOS.jobs.toggle(j.id,e.target.checked).then(refresh)}/> 启用</label><ConfirmButton kindLabel={`任务 ${j.name}`} onConfirm={()=>{ void window.creatorOS.jobs.delete(j.id).then(refresh); }}/></div></article>;
    })}</section>
  </div></div>;
}
