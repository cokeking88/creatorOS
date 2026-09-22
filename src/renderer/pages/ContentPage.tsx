import React,{useMemo,useState} from 'react'; import type { AppState, ContentItem } from '../../shared/types';
import { fmtUpdate } from '../../shared/format';
import { Empty } from '../components/Empty'; import { IcContent } from '../components/icons';

const STATUS_LABEL: Record<ContentItem['status'], string> = { draft:'草稿', idea:'灵感', scheduled:'已排期', published:'已发布', archived:'已归档' };

export function ContentPage({state,refresh}:{state:AppState|null;refresh:()=>void}) {
  const [title,setTitle]=useState(''); const [body,setBody]=useState(''); const [platform,setPlatform]=useState('xiaohongshu'); const [accountId,setAccountId]=useState('');
  const [toast,setToast]=useState(false); const [flashId,setFlashId]=useState<string|null>(null);
  const platformRow=state?.platforms.find(p=>p.key===platform); const accounts=useMemo(()=>state?.accounts.filter(a=>a.platformId===platformRow?.id)||[],[state?.accounts,platformRow?.id]);
  async function saveDraft(){
    await window.creatorOS.content.create({title:title||'无标题草稿',body,platform,accountId:accountId||null,status:'draft'}).then(created=>{ setTitle(''); setBody(''); setFlashId(String((created as {id?:string}).id??'')); refresh(); });
    setToast(true); setTimeout(()=>{ setToast(false); setFlashId(null); },3000);
  }
  return <div className="page"><h1>内容</h1><p className="muted">撰写与沉淀各平台草稿。</p>{toast&&<div className="toast">已保存草稿</div>}
  <div className="content-grid"><section className="panel"><h2>新建草稿</h2>
    <select className="field" value={platform} onChange={e=>{setPlatform(e.target.value);setAccountId('')}}>{state?.platforms.map(p=><option key={p.id} value={p.key}>{p.name}</option>)}</select>
    <select className="field" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">不关联账号</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <input className="field" placeholder="标题" value={title} onChange={e=>setTitle(e.target.value)}/>
    <textarea className="field" rows={9} placeholder="正文…" value={body} onChange={e=>setBody(e.target.value)}/>
    <button className="btn-primary" onClick={saveDraft}>保存草稿</button>
  </section><section className="panel"><h2>草稿库</h2>
    {state?.contents.length?state.contents.map(c=><article key={c.id} className={flashId===c.id?'content-item flash':'content-item'}><div><b>{c.title}</b><p><span className="pill">{state.platforms.find(p=>p.key===c.platform)?.name??c.platform}</span>{c.accountId?` · ${state.accounts.find(a=>a.id===c.accountId)?.name??c.accountId}`:''} · <span className="muted small">{fmtUpdate(c.updatedAt)}</span> · {c.body.length>100?`${c.body.slice(0,100)}…`:c.body}</p></div><span className="pill">{STATUS_LABEL[c.status]}</span></article>)
    :<Empty icon={<IcContent/>} title="还没有草稿" hint="左侧写下第一篇，保存后出现在这里"/>}
  </section></div></div>;
}
