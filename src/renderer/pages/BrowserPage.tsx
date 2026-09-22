import React,{useEffect,useRef,useState} from 'react'; import type { AppState } from '../../shared/types';
import { IcBack, IcForward, IcReload, IcPlus, IcClose } from '../components/icons';

/** Inline name capture replacing window.prompt (sandboxed renderer disables prompt). */
function NewProfileInput({onCreate,onCancel}:{onCreate:(name:string)=>void;onCancel:()=>void}) {
  const [name,setName]=useState(''); const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  return <input ref={ref} className="browser-top-input" aria-label="New profile name"
    placeholder="身份名称，回车创建" value={name}
    onChange={e=>setName(e.target.value)}
    onKeyDown={e=>{ if(e.key==='Enter'&&name.trim()){onCreate(name.trim());} else if(e.key==='Escape'){onCancel();} }}
    onBlur={()=>{ if(!name.trim())onCancel(); }} />;
}

export function BrowserPage({state,refresh}:{state:AppState|null;refresh:()=>void}) { const ref=useRef<HTMLDivElement>(null);const [url,setUrl]=useState(''); const [creating,setCreating]=useState(false); const active=state?.tabs.find(t=>t.id===state.activeTabId);
 useEffect(()=>{setUrl(active?.url??'')},[active?.url]);
 useEffect(()=>{const send=()=>{const r=ref.current?.getBoundingClientRect();if(r)window.creatorOS.browser.layout({x:Math.round(r.x),y:Math.round(r.y),width:Math.max(1,Math.round(r.width)),height:Math.max(1,Math.round(r.height))},true)};send();const ro=new ResizeObserver(send);if(ref.current)ro.observe(ref.current);window.addEventListener('resize',send);return()=>{ro.disconnect();window.removeEventListener('resize',send);window.creatorOS.browser.layout({x:0,y:0,width:1,height:1},false)}},[]);
 const createProfile=async(name:string)=>{setCreating(false);await window.creatorOS.profile.create({name});refresh();};
 return <div className="browser-page"><div className="browser-top">
   <button className="btn-ghost" title="Back" aria-label="Back" onClick={()=>window.creatorOS.browser.back()}><IcBack/></button>
   <button className="btn-ghost" title="Forward" aria-label="Forward" onClick={()=>window.creatorOS.browser.forward()}><IcForward/></button>
   <button className="btn-ghost" title="Reload" aria-label="Reload" onClick={()=>window.creatorOS.browser.reload()}><IcReload/></button>
   <form onSubmit={e=>{e.preventDefault();window.creatorOS.browser.navigate(url)}}><input aria-label="Address" placeholder="输入网址或搜索，回车打开" value={url} onChange={e=>setUrl(e.target.value)} /></form>
   <button className="btn-ghost" title="New tab" aria-label="New tab" onClick={()=>window.creatorOS.tab.create(state?.activeProfileId??undefined,'https://www.google.com').then(refresh)}><IcPlus/></button>
   <select aria-label="Active profile" value={state?.activeProfileId??''} onChange={e=>window.creatorOS.profile.activate(e.target.value).then(refresh)}>{state?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
   {creating
     ? <NewProfileInput onCreate={createProfile} onCancel={()=>setCreating(false)} />
     : <button className="btn-ghost" title="新建浏览器身份" aria-label="New profile" onClick={()=>setCreating(true)}>＋ 身份</button>}
 </div><div className="tabs">{state?.tabs.filter(t=>t.profileId===state.activeProfileId).map(t=><div key={t.id} className={t.active?'tab active':'tab'} onClick={()=>window.creatorOS.tab.activate(t.id).then(refresh)}>{t.loading&&<span className="tab-dot"/>}<span>{t.title||'新标签页'}</span><button aria-label="Close tab" onClick={e=>{e.stopPropagation();window.creatorOS.tab.close(t.id).then(refresh)}}><IcClose/></button></div>)}</div><div ref={ref} className="browser-slot"><div className="browser-placeholder">输入网址开始浏览</div></div></div>; }
