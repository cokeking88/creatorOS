import React,{useEffect,useRef,useState} from 'react';
import type { AgentStep, AgentRunResult, SkillRecord } from '../../shared/types';
import { fmtCost, fmtDur, toolLabel } from '../../shared/format';
import { Empty } from './Empty';
import { IcSpinner, IcOk, IcFail, IcWarn, IcAutomation } from './icons';

/**
 * Single source of truth for one agent run (arch spec §2.4).
 * user bubbles and RunItems are the only item kinds; the assistant text is
 * rendered BY the RunItem (inline typewriter while running, one final bubble
 * in a terminal state) — never appended as its own item (G2).
 */
type RunItem = {
  kind:'run';
  runId:string;
  source:string;
  steps:AgentStep[];
  /** typewriter buffer grouped by assistant message uuid (G3) */
  streamText:Array<{uuid:string;text:string}>;
  status:'running'|'done'|'error'|'interrupted';
  /** authoritative final reply (done payload / result step text) */
  finalText:string;
  expandedSeq:number|null;
  meta?:{cost?:number|null;durationMs?:number|null;sessionId?:string|null};
};
type Item = { kind:'user'; text:string } | RunItem;

/** Aggregate a text step into the uuid-keyed typewriter buffer (G3). */
function applyTextStep(streamText:RunItem['streamText'],step:AgentStep):RunItem['streamText'] {
  const uuid=step.msgUuid||'default';
  const idx=streamText.findIndex(e=>e.uuid===uuid);
  if(step.isDelta){
    if(idx<0)return [...streamText,{uuid,text:step.text??''}];
    const next=[...streamText];next[idx]={uuid,text:next[idx].text+(step.text??'')};return next;
  }
  // Full text replaces the same message's buffer entirely; other messages are kept.
  if(idx<0)return [...streamText,{uuid,text:step.text??''}];
  const next=[...streamText];next[idx]={uuid,text:step.text??''};return next;
}

function StepLine({step,expanded,onToggle}:{step:AgentStep;expanded:boolean;onToggle:()=>void}) {
  const time=new Date(step.time).toLocaleTimeString();
  if(step.type==='tool_start') return <div className={`step ${expanded?'open':''}`} onClick={onToggle}>
    <span className="step-icon spin"><IcSpinner/></span>
    <span className="step-label">{toolLabel(step.tool)}</span>
    {step.inputText && <span className="step-hint">{expanded?'收起':'展开'}</span>}
    <span className="step-time">{time}</span>
    {expanded && step.inputText && <pre className="step-json">{step.tool&&<><code>{step.tool}</code>{'\n'}</>}{step.inputText}</pre>}
  </div>;
  if(step.type==='tool_result') return <div className={`step result ${step.ok?'ok':'fail'}`} onClick={onToggle}>
    <span className="step-icon">{step.ok?<IcOk/>:<IcFail/>}</span>
    <span className="step-label">{toolLabel(step.tool)}</span>
    {step.detail && <span className="step-hint">{expanded?'收起':'详情'}</span>}
    <span className="step-time">{typeof step.durationMs==='number'?fmtDur(step.durationMs):time}</span>
    {expanded && step.detail && <pre className="step-json">{step.tool&&<><code>{step.tool}</code>{'\n'}</>}{step.detail}</pre>}
  </div>;
  if(step.type==='done'||step.type==='error') { let meta:Record<string,unknown>={}; try { meta=step.detail?JSON.parse(step.detail):{}; } catch { /* non-json detail */ }
    const interrupted=meta.subtype==='interrupted';
    // Failure reason inline (not buried in the expandable JSON): error rows show
    // the raw reason text right after the label, full detail still expandable.
    const reason=typeof meta.error==='string'&&meta.error?meta.error:step.type==='error'&&!interrupted?String(step.detail||'').slice(0,0):'';
    return <div className={`step ${step.type}`} onClick={onToggle}>
      <span className="step-icon">{step.type==='done'?'●':<IcWarn/>}</span>
      <span className="step-label">{step.type==='done'?'完成':interrupted?'已中断':'出错'}</span>
      {step.type==='error'&&reason&&<span className="step-error" title={reason}>{reason.length>70?`${reason.slice(0,70)}…`:reason}</span>}
      {step.type==='error' && step.detail && <span className="step-hint">{expanded?'收起':'详情'}</span>}
      {typeof meta.cost==='number'&&<span className="step-time">{fmtCost(meta.cost)}</span>}
      {typeof meta.durationMs==='number'&&<span className="step-time">{fmtDur(meta.durationMs)}</span>}
      {expanded && step.type==='error' && step.detail && <pre className="step-json">{step.detail}</pre>}
    </div>; }
  return null;
}

export function AgentPanel(){
  const [msg,setMsg]=useState('');
  const [items,setItems]=useState<Item[]>([]);
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [activeRunId,setActiveRunId]=useState<string|null>(null);
  const [skills,setSkills]=useState<SkillRecord[]>([]);
  const chatRef=useRef<HTMLDivElement>(null);

  /** Derived: the chat run started from this panel is still running (cron runs never block the composer). */
  const busy=items.some(it=>it.kind==='run'&&it.runId===activeRunId&&it.status==='running');
  /** Derived: latest running cron run, by runId — banner clears when its done lands (G1). */
  const cronRun=([...items].reverse().find(it=>it.kind==='run'&&it.source.startsWith('cron:')&&it.status==='running') as RunItem|undefined);

  const scrollToBottom=()=>{ if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight; };
  useEffect(scrollToBottom,[items]);

  useEffect(()=>{
    const offStep=window.creatorOS.onAgentStep((s)=>{
      setItems(prev=>{
        // Every step lands in the run's RunItem — the only place steps are stored.
        let idx=-1; for(let i=prev.length-1;i>=0;i--){ const it=prev[i]; if(it.kind==='run'&&it.runId===s.runId){idx=i;break;} }
        if(idx<0){ // A run we have no item for yet (cron or a race): create one and let events drive it.
          const run:RunItem={kind:'run',runId:s.runId,source:s.source??'chat',steps:[s],streamText:s.type==='text'?applyTextStep([],s):[],status:'running',finalText:'',expandedSeq:null};
          return [...prev,run];
        }
        const run=prev[idx] as RunItem;
        const nextRun:RunItem={...run,steps:[...run.steps,s]};
        if(s.type==='text')nextRun.streamText=applyTextStep(run.streamText,s);
        const next=[...prev];next[idx]=nextRun;return next;
      });
    });
    const offDone=window.creatorOS.onAgentDone((r)=>{
      // Only mutates the existing RunItem's terminal fields — never appends (G2).
      setItems(prev=>{
        let idx=-1; for(let i=prev.length-1;i>=0;i--){ const it=prev[i]; if(it.kind==='run'&&it.runId===r.runId){idx=i;break;} }
        if(idx<0)return prev; // stale event after a reload: ignore
        const run=prev[idx] as RunItem;
        const status:RunItem['status']=r.interrupted?'interrupted':r.ok?'done':'error';
        const next=[...prev];
        next[idx]={...run,status,finalText:r.text??run.finalText,meta:{cost:r.costUsd??null,durationMs:r.durationMs??null,sessionId:r.sessionId??null}};
        return next;
      });
      const res=r as AgentRunResult;
      if(res.sessionId)setSessionId(res.sessionId);
    });
    return ()=>{offStep();offDone();};
  },[]);

  // Skills for the empty-state「运行技能」chips (§12.2): fetch on mount + on every
  // state change (skill creates/edits/deletes broadcast EVENT_STATE_CHANGED).
  useEffect(()=>{ const load=()=>{ void window.creatorOS.state().then(s=>setSkills(s.skills)); }; load(); return window.creatorOS.onStateChanged(load); },[]);

  async function send(){
    if(!msg.trim()||busy)return;
    const prompt=msg;
    setMsg('');
    try{
      // Returns immediately with the runId; every later state arrives as events.
      const {runId}=await window.creatorOS.agent.run(prompt,sessionId??undefined);
      setActiveRunId(runId);
      setItems(prev=>[...prev,{kind:'user',text:prompt},{kind:'run',runId,source:'chat',steps:[],streamText:[],status:'running',finalText:'',expandedSeq:null}]);
    }catch(e){
      setItems(prev=>[...prev,{kind:'user',text:prompt},{kind:'run',runId:'error',source:'chat',steps:[],streamText:[],status:'error',finalText:`Error: ${String(e)}`,expandedSeq:null}]);
    }
  }

  async function stop(){
    if(activeRunId)await window.creatorOS.agent.stop(activeRunId);
  }

  return <aside className="agent">
    <header><b>Agent</b><span className={busy?'running':''}>{busy?'运行中…':'Claude Code'}</span></header>
    {cronRun&&<div className="cron-banner"><span>定时任务「{cronRun.source.slice('cron:'.length)}」运行中…</span><button className="btn-link" onClick={()=>void window.creatorOS.agent.stop(cronRun.runId)}>停止</button></div>}
    <div className="chat" ref={chatRef}>
      {items.length===0&&<Empty icon={<IcAutomation/>} title="Agent 待命中" hint="内置 Agent 由 Claude Code 驱动，能操作浏览器、读写文件"
        suggestGroups={[
          { items:[
            {label:'检查各账号登录态',onPick:()=>setMsg('检查各账号登录态')},
            {label:'打开小红书创作中心并截图',onPick:()=>setMsg('打开小红书创作中心并截图')},
            {label:'列出所有定时任务',onPick:()=>setMsg('列出所有定时任务')}]},
          // 运行技能 chips (§2.3 入口 1): template text fills the composer, NEVER auto-sends —
          // the user reviews and replaces {占位符} first. Only shown while skills exist.
          ...(skills.length>0?[{label:'运行技能',items:skills.slice(0,3).map(s=>({label:s.name,title:s.description||s.promptTemplate,onPick:()=>setMsg(s.promptTemplate)}))}]:[]),
        ]}/>}
      {items.map((it,i)=>{
        if(it.kind==='user')return <div key={i} className="bubble user">{it.text}</div>;
        const running=it.status==='running';
        const inline=running?it.streamText.map(e=>e.text).join(''):null;
        return <div key={i} className={`step-group ${running?'':'done'}`}>
          {it.steps.map(s=>
            <StepLine key={s.seq} step={s} expanded={it.expandedSeq===s.seq} onToggle={()=>setItems(prev=>{const n=[...prev];const c=n[i] as RunItem;c.expandedSeq=c.expandedSeq===s.seq?null:s.seq;return n;})}/>
          )}
          {running&&inline!==null&&<div className="bubble assistant inline">{inline}</div>}
          {!running&&it.finalText&&<div className={`bubble assistant ${it.status==='error'?'pending':''}`}>{it.finalText}</div>}
        </div>;
      })}
    </div>
    <div className="composer">
      <textarea value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder={sessionId?'继续对话（保留上下文）…':'给 Agent 下指令…'}/>
      <div className="composer-actions">
        <span className="muted small">{sessionId?'会话已续接':'新会话'}</span>
        {busy
          ? <button className="btn-danger" onClick={stop}>■ 停止</button>
          : <button className="btn-primary" onClick={send}>发送</button>}
      </div>
    </div>
  </aside>;
}
