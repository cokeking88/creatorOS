import React,{useEffect,useMemo,useRef,useState} from 'react';
import type { AppState } from '../../shared/types';
import { Empty } from '../components/Empty';
import { IcBrowser, IcAccounts } from '../components/icons';

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
  const nameRef=useRef<HTMLInputElement>(null);
  const freeProfiles=useMemo(()=>state?.profiles.filter(p=>!p.accountId)||[],[state?.profiles]);
  async function addProfile(n:string){await window.creatorOS.profile.create({name:n,platform:state?.platforms.find(p=>p.id===platformId)?.key});setCreatingProfile(false);refresh();}
  async function renameProfile(id:string,n:string){await window.creatorOS.profile.rename(id,n);setRenaming(null);refresh();}
  async function addAccount(){if(!name.trim())return;await window.creatorOS.account.create({name,handle,platformId,browserProfileId:profileId||undefined});setName('');setHandle('');setProfileId('');refresh();}
  const platformName=(key?:string|null)=>state?.platforms.find(p=>p.key===key)?.name??'通用';
  return <div className="page"><h1>账号与身份</h1><p className="muted">每个运营账号可绑定一个浏览器身份，登录态永久保存在身份里，不在 Agent 对话里。</p>
  <div className="content-grid">
    <section className="panel"><h2>浏览器身份</h2>
      <p className="muted">一个身份一个登录态。可在「浏览器」页右上角快捷新建。</p>
      {creatingProfile
        ? <InlineInput placeholder="新身份名称（回车确认，Esc 取消）" ariaLabel="New profile name" onCommit={addProfile} onCancel={()=>setCreatingProfile(false)} />
        : <button className="btn-ghost" onClick={()=>setCreatingProfile(true)}>＋ 新建身份</button>}
      {state?.profiles.length?state.profiles.map(p=>{const account=state.accounts.find(a=>a.browserProfileId===p.id);return <article className="content-item" key={p.id}>
        <div>
          {renaming===p.id
            ? <InlineInput initial={p.name} ariaLabel={`Rename ${p.name}`} placeholder="新名称" onCommit={(n)=>renameProfile(p.id,n)} onCancel={()=>setRenaming(null)} />
            : <><b>{p.name}</b><p title={`分区 ${p.partition}`}>{platformName(p.platform)}{account?` · 绑定账号：${account.name}`:' · 未绑定'}</p></>}
        </div>
        <span className={account?'pill ok':'pill'}>{account?.name??'未绑定'}</span>
        {renaming!==p.id&&<button className="btn-link" aria-label={`Rename ${p.name}`} onClick={()=>setRenaming(p.id)}>重命名</button>}
      </article>}):<Empty icon={<IcBrowser/>} title="还没有浏览器身份" hint="身份是登录态的容器，一个账号一个身份" action={<button className="btn-primary" onClick={()=>setCreatingProfile(true)}>创建浏览器身份</button>}/>}
    </section>
    <section className="panel"><h2>运营账号</h2>
      <section>
        <h3>新建账号</h3>
        <select className="field" aria-label="Platform" value={platformId} onChange={e=>setPlatformId(e.target.value)}>{state?.platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input className="field" ref={nameRef} placeholder="账号名" value={name} onChange={e=>setName(e.target.value)}/>
        <input className="field" placeholder="Handle（可选）" value={handle} onChange={e=>setHandle(e.target.value)}/>
        <div className="row"><select className="field" aria-label="Bind profile" value={profileId} onChange={e=>setProfileId(e.target.value)}><option value="">暂不绑定身份</option>{freeProfiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div className="row"><button className="btn-primary" disabled={!name.trim()} onClick={addAccount}>创建账号</button></div>
        {!name.trim()&&<p className="err-msg">请先填写账号名</p>}
      </section>
      <section>
        <h3>已有账号</h3>
        {state?.accounts.length?state.accounts.map(a=>{const platform=state.platforms.find(p=>p.id===a.platformId);const profile=state.profiles.find(p=>p.id===a.browserProfileId);return <article className="content-item" key={a.id}><div><b>{a.name}</b><p>{platform?.name??a.platformId}{a.handle?` · ${a.handle}`:''}</p></div><div className="row"><span className="pill">{platform?.name??''}</span><span className={profile?'pill ok':'pill'}>{profile?.name??'未绑定'}</span></div></article>}):<Empty icon={<IcAccounts/>} title="还没有运营账号" hint="创建账号后会自动分配一个专属文件目录" action={<button className="btn-primary" onClick={()=>nameRef.current?.focus()}>创建第一个账号</button>}/>}
      </section>
    </section>
  </div></div>;
}
