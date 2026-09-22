import React,{useEffect,useMemo,useRef,useState} from 'react';
import type { AppState } from '../../shared/types';

/** Inline input used for profile name creation/rename (window.prompt is disabled in sandboxed renderers). */
function InlineInput({initial,placeholder,onCommit,onCancel,ariaLabel}:{initial?:string;placeholder:string;onCommit:(v:string)=>void;onCancel:()=>void;ariaLabel:string}) {
  const [v,setV]=useState(initial??''); const ref=useRef<HTMLInputElement>(null);
  useEffect(()=>{ref.current?.focus();ref.current?.select?.();},[]);
  return <input ref={ref} className="field" aria-label={ariaLabel} placeholder={placeholder} value={v}
    onChange={e=>setV(e.target.value)}
    onKeyDown={e=>{ if(e.key==='Enter'&&v.trim()){onCommit(v.trim());} else if(e.key==='Escape'){onCancel();} }}
    onBlur={()=>{ if(!v.trim()||v.trim()===initial)onCancel(); else onCommit(v.trim()); }} />;
}

export function AccountsPage({state,refresh}:{state:AppState|null;refresh:()=>void}){
  const [name,setName]=useState(''); const [handle,setHandle]=useState('');
  const [platformId,setPlatformId]=useState('xiaohongshu'); const [profileId,setProfileId]=useState('');
  const [creatingProfile,setCreatingProfile]=useState(false);
  const [renaming,setRenaming]=useState<string|null>(null);
  const freeProfiles=useMemo(()=>state?.profiles.filter(p=>!p.accountId)||[],[state?.profiles]);
  async function addProfile(n:string){await window.creatorOS.profile.create({name:n,platform:state?.platforms.find(p=>p.id===platformId)?.key});setCreatingProfile(false);refresh();}
  async function renameProfile(id:string,n:string){await window.creatorOS.profile.rename(id,n);setRenaming(null);refresh();}
  async function addAccount(){if(!name.trim())return;await window.creatorOS.account.create({name,handle,platformId,browserProfileId:profileId||undefined});setName('');setHandle('');setProfileId('');refresh();}
  return <div className="page"><h1>Accounts & Profiles</h1><p className="muted">Each social account can bind to a persistent browser profile. The login state lives in that profile, not in the Agent chat.</p>
  <div className="content-grid">
    <section className="panel"><h2>Browser Profiles</h2>
      <p className="muted">浏览器身份管理：一个运营身份一个 Profile，登录态永久保存在各自分区。在 Browser 页 ＋P 可快捷新建。</p>
      {creatingProfile
        ? <InlineInput placeholder="新 Profile 名称（回车确认，Esc 取消）" ariaLabel="New profile name" onCommit={addProfile} onCancel={()=>setCreatingProfile(false)} />
        : <button onClick={()=>setCreatingProfile(true)}>＋ 新建 Profile</button>}
      {state?.profiles.length?state.profiles.map(p=>{const account=state.accounts.find(a=>a.browserProfileId===p.id);return <article className="content-item" key={p.id}>
        <div>
          {renaming===p.id
            ? <InlineInput initial={p.name} ariaLabel={`Rename ${p.name}`} placeholder="新名称" onCommit={(n)=>renameProfile(p.id,n)} onCancel={()=>setRenaming(null)} />
            : <><b>{p.name}</b><p>{p.platform??'general'}{account?` · 绑定账号：${account.name}`:' · 未绑定账号'} · 分区 <code>{p.partition}</code></p></>}
        </div>
        <span className="pill">{account?.name??'空闲'}</span>
        {renaming!==p.id&&<button className="link-btn" aria-label={`Rename ${p.name}`} onClick={()=>setRenaming(p.id)}>重命名</button>}
      </article>}):<p className="muted">No profiles yet.</p>}
    </section>
    <section className="panel"><h2>Accounts</h2>
      <section>
        <h3>New account</h3>
        <select className="field" aria-label="Platform" value={platformId} onChange={e=>setPlatformId(e.target.value)}>{state?.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className="field" placeholder="Account name" value={name} onChange={e=>setName(e.target.value)}/>
        <input className="field" placeholder="Handle (optional)" value={handle} onChange={e=>setHandle(e.target.value)}/>
        <div className="row"><select className="field" aria-label="Bind profile" value={profileId} onChange={e=>setProfileId(e.target.value)}><option value="">No profile yet</option>{freeProfiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <button className="primary" onClick={addAccount}>Create account</button>
      </section>
      <section>
        <h3>Managed accounts</h3>
        {state?.accounts.length?state.accounts.map(a=>{const platform=state.platforms.find(p=>p.id===a.platformId);const profile=state.profiles.find(p=>p.id===a.browserProfileId);return <article className="content-item" key={a.id}><div><b>{a.name}</b><p>{platform?.name??a.platformId}{a.handle?` · ${a.handle}`:''}</p></div><span className="pill">{profile?.name??'No Profile'}</span></article>}):<p className="muted">No accounts yet.</p>}
      </section>
    </section>
  </div></div>;
}
