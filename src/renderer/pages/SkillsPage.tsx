import React,{useEffect,useRef,useState} from 'react'; import type { AppState, SkillRecord } from '../../shared/types';
import { fmtUpdate } from '../../shared/format';
import { CRON_TEMPLATES, cronPreview } from '../../shared/cronPreview';
import { parseCron } from '../../shared/cronNext';
import { Empty } from '../components/Empty';
import { ConfirmButton } from '../components/ConfirmButton';
import { IcSkills } from '../components/icons';

/**
 * Skills page (agent-capabilities §12.1, five states: empty / list / editing /
 * delete-confirm / bind-form). Data rides the app:state skills projection —
 * this page opens ZERO new execution surfaces: saves go through the three
 * skills write channels, 运行 through the existing agent.run, binding through
 * jobs.create (payload {skillId} reference semantics, §2.4 方案 A).
 */

/** One toast with an error variant (run/save/bind failures show red, §12.1). */
function useToast() {
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (text: string, error?: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, error });
    timer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show };
}

export function SkillsPage({state,refresh}:{state:AppState|null;refresh:()=>void}){
  const [name,setName]=useState(''); const [desc,setDesc]=useState(''); const [template,setTemplate]=useState('');
  const [editing,setEditing]=useState<SkillRecord|null>(null);
  const [saveErr,setSaveErr]=useState<string|null>(null);
  const [flashId,setFlashId]=useState<string|null>(null);
  const [binding,setBinding]=useState<string|null>(null);          // skill id whose inline bind form is open (only one at a time)
  const [bindCron,setBindCron]=useState('0 9 * * *');
  const [running,setRunning]=useState<string|null>(null);         // skill id whose agent.run IPC is in flight (anti double-click)
  const [armedDel,setArmedDel]=useState<string|null>(null);        // ConfirmButton armed state, drives the .skill-del-hint
  const { toast, show: showToast } = useToast();
  const invalid=!name.trim()||!template.trim();
  const bindTemplateValue=CRON_TEMPLATES.some(t=>t.value===bindCron)?bindCron:'__custom';
  const bindPreview=cronPreview(bindCron);
  const bindInvalid=!parseCron(bindCron);
  const flash=(s:SkillRecord)=>{ setFlashId(s.id); setTimeout(()=>setFlashId(null),3000); };
  const resetForm=()=>{ setName(''); setDesc(''); setTemplate(''); setEditing(null); setSaveErr(null); };
  const startEdit=(s:SkillRecord)=>{ setEditing(s); setName(s.name); setDesc(s.description); setTemplate(s.promptTemplate); setSaveErr(null); };
  async function save(){
    if(invalid)return;
    try{
      const saved=editing
        ? await window.creatorOS.skills.update(editing.id,{name,description:desc,promptTemplate:template})
        : await window.creatorOS.skills.create({name,description:desc,promptTemplate:template});
      setSaveErr(null); showToast('已保存技能'); if(saved)flash(saved); resetForm(); refresh();
    }catch(e){ setSaveErr(`保存失败：${String(e)}`); }
  }
  async function runSkill(s:SkillRecord){
    if(running)return;
    setRunning(s.id);
    try{ await window.creatorOS.agent.run(s.promptTemplate); showToast('已触发运行，到 Agent 面板查看'); }
    catch(e){ showToast(`运行触发失败：${String(e)}`,true); }
    finally{ setRunning(null); }
  }
  async function createBindJob(s:SkillRecord){
    try{
      await window.creatorOS.jobs.create({name:s.name,cron:bindCron,workflowType:'agent.run',payload:{skillId:s.id,prompt:null}});
      showToast('已创建定时任务'); setBinding(null); refresh();
    }catch(e){ showToast(`创建定时任务失败：${String(e)}`,true); }
  }
  return <div className="page"><h1>技能</h1><p className="muted">把对 Agent 说过的有效指令，沉淀成可复用、可定时执行的模板。</p>
  {toast&&<div className={toast.error?'toast error':'toast'}>{toast.text}</div>}
  <div className="content-grid">
    <section className="panel skill-form"><h2>{editing?<>编辑：{editing.name}<button className="btn-link" onClick={resetForm}>取消</button></>:'新建技能'}</h2>
      <label className="field-label" htmlFor="skill-name">名称</label>
      <input id="skill-name" className="field" placeholder="如：每日登录态巡检" value={name} onChange={e=>setName(e.target.value)}/>
      <label className="field-label" htmlFor="skill-desc">描述</label>
      <input id="skill-desc" className="field" placeholder="一句话说明这个技能做什么（可选）" value={desc} onChange={e=>setDesc(e.target.value)}/>
      <label className="field-label" htmlFor="skill-template">指令模板</label>
      <textarea id="skill-template" className="field" rows={10} placeholder="打开 {账号} 的创作中心，检查登录态并截图保存到 drafts" value={template} onChange={e=>setTemplate(e.target.value)}/>
      <p className="help">{'{占位符} 在发送前手动替换，应用不会自动解析'}</p>
      <button className="btn-primary" disabled={invalid} onClick={()=>void save()}>{editing?'保存修改':'保存技能'}</button>
      {invalid&&<p className="err-msg">请填写名称和指令模板</p>}
      {saveErr&&<p className="err-msg">{saveErr}</p>}
    </section>
    <section className="panel"><h2>技能库</h2>
      {state?.skills.length?state.skills.map(s=>{
        const bindCount=(state.jobs??[]).filter(j=>(j.payload as {skillId?:unknown}).skillId===s.id).length;
        const cls=`content-item skill-item${editing?.id===s.id?' editing':''}${flashId===s.id?' flash':''}`;
        return <article key={s.id} className={cls}>
          <div className="skill-item-head"><b>{s.name}</b>{s.origin==='agent'&&<span className="pill info">Agent 创建</span>}</div>
          <p>{s.description||'（无描述）'} · <span className="muted small">更新于 {fmtUpdate(s.updatedAt)}</span></p>
          <div className="skill-item-actions">
            <button disabled={running===s.id} onClick={()=>void runSkill(s)}>运行</button>
            <button onClick={()=>startEdit(s)}>编辑</button>
            <button onClick={()=>{ setBinding(binding===s.id?null:s.id); setBindCron('0 9 * * *'); }}>绑定定时任务</button>
            <ConfirmButton kindLabel={`技能 ${s.name}`} onArmedChange={armed=>setArmedDel(armed?s.id:null)} onConfirm={()=>{ void window.creatorOS.skills.delete(s.id).then(()=>{ setArmedDel(null); refresh(); }); }}/>
          </div>
          {armedDel===s.id&&bindCount>0&&<p className="skill-del-hint">{`该技能被 ${bindCount} 个定时任务引用，删除后这些任务将运行失败`}</p>}
          {binding===s.id&&<div className="skill-bind">
            <label className="field-label" htmlFor="skill-bind-cron">执行周期</label>
            <select id="skill-bind-cron" className="field" value={bindTemplateValue} onChange={e=>{ if(e.target.value!=='__custom')setBindCron(e.target.value); }}>
              {CRON_TEMPLATES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              <option value="__custom">自定义</option>
            </select>
            {bindTemplateValue==='__custom'&&<input className="field" placeholder="cron 表达式，如 0 9 * * *" value={bindCron} onChange={e=>setBindCron(e.target.value)}/>}
            {bindPreview
              ? <p className="muted cron-preview">{bindPreview}</p>
              : parseCron(bindCron) ? <p className="muted cron-preview">366 天内不会触发</p> : <p className="muted cron-preview">无法预览该表达式</p>}
            {s.origin==='agent'&&<p className="help">该技能由 Agent 生成，绑定定时任务前请先确认模板内容</p>}
            <button className="btn-primary" disabled={bindInvalid} onClick={()=>void createBindJob(s)}>创建定时任务</button>
          </div>}
        </article>;
      }):<Empty icon={<IcSkills/>} title="还没有技能" hint="对话里让 Agent 沉淀经验，或在这里写下第一个技能"/>}
    </section>
  </div></div>;
}
