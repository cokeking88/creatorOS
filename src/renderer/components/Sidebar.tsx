import React from 'react';
import { BrandMark, IcDashboard, IcBrowser, IcAccounts, IcFiles, IcContent, IcAutomation, IcLogs, IcSettings } from './icons';
export type Page='dashboard'|'browser'|'accounts'|'files'|'content'|'automation'|'logs'|'settings';
const items:[Page,()=>React.ReactNode,string][]=[['dashboard',IcDashboard,'工作台'],['browser',IcBrowser,'浏览器'],['accounts',IcAccounts,'账号'],['files',IcFiles,'文件'],['content',IcContent,'内容'],['automation',IcAutomation,'自动化'],['logs',IcLogs,'日志'],['settings',IcSettings,'设置']];
export function Sidebar({page,setPage}:{page:Page;setPage:(p:Page)=>void}) { return <aside className="sidebar"><div className="brand"><BrandMark/><span>CreatorOS</span></div>{items.map(([k,Ic,l])=><button key={k} className={page===k?'active':''} onClick={()=>setPage(k)}><b><Ic/></b>{l}</button>)}</aside>; }
