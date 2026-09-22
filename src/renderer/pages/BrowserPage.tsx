import React,{useEffect,useRef,useState} from 'react'; import type { AppState } from '../../shared/types';

/** Inline name capture replacing window.prompt (sandboxed renderer disables prompt). */
function NewProfileInput({onCreate,onCancel}:{onCreate:(name:string)=>void;onCancel:()=>void}) {
  const [name,setName]=useState(''); const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();},[]);
  return <input ref={ref} className="browser-top-input" aria-label="New profile name"
    placeholder="Profile 名称，回车创建" value={name}
    onChange={e=>setName(e.target.value)}
    onKeyDown={e=>{ if(e.key==='Enter'&&name.trim()){onCreate(name.trim());} else if(e.key==='Escape'){onCancel();} }}
    onBlur={()=>{ if(!name.trim())onCancel(); }} />;
}

export function BrowserPage({state,refresh}:{state:AppState|null;refresh:()=>void}) { const ref=useRef<HTMLDivElement>(null);const [url,setUrl]=useState(''); const [creating,setCreating]=useState(false); const active=state?.tabs.find(t=>t.id===state.activeTabId);
 useEffect(()=>{setUrl(active?.url??'')},[active?.url]);
 useEffect(()=>{const send=()=>{const r=ref.current?.getBoundingClientRect();if(r)window.creatorOS.browser.layout({x:Math.round(r.x),y:Math.round(r.y),width:Math.max(1,Math.round(r.width)),height:Math.max(1,Math.round(r.height))},true)};send();const ro=new ResizeObserver(send);if(ref.current)ro.observe(ref.current);window.addEventListener('resize',send);return()=>{ro.disconnect();window.removeEventListener('resize',send);window.creatorOS.browser.layout({x:0,y:0,width:1,height:1},false)}},[]);
 const createProfile=async(name:string)=>{setCreating(false);await window.creatorOS.profile.create({name});refresh();};
 return <div className="browser-page"><div className="browser-top"><select aria-label="Active profile" value={state?.activeProfileId??''} onChange={e=>window.creatorOS.profile.activate(e.target.value).then(refresh)}>{state?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
 {creating
   ? <NewProfileInput onCreate={createProfile} onCancel={()=>setCreating(false)} />
   : <button title="New profile" aria-label="New profile" onClick={()=>setCreating(true)}>＋P</button>}
 <button title="Back" aria-label="Back" onClick={()=>window.creatorOS.browser.back()}>←</button><button title="Forward" aria-label="Forward" onClick={()=>window.creatorOS.browser.forward()}>→</button><button title="Reload" aria-label="Reload" onClick={()=>window.creatorOS.browser.reload()}>↻</button><form onSubmit={e=>{e.preventDefault();window.creatorOS.browser.navigate(url)}}><input aria-label="Address" value={url} onChange={e=>setUrl(e.target.value)} /></form><button title="New tab" aria-label="New tab" onClick={()=>window.creatorOS.tab.create(state?.activeProfileId??undefined,'https://www.google.com').then(refresh)}>＋</button></div><div className="tabs">{state?.tabs.filter(t=>t.profileId===state.activeProfileId).map(t=><div key={t.id} className={t.active?'tab active':'tab'} onClick={()=>window.creatorOS.tab.activate(t.id).then(refresh)}><span>{t.loading?'● ':''}{t.title||'New Tab'}</span><button onClick={e=>{e.stopPropagation();window.creatorOS.tab.close(t.id).then(refresh)}}>×</button></div>)}</div><div ref={ref} className="browser-slot"><div className="browser-placeholder">Embedded WebContentsView</div></div></div>; }