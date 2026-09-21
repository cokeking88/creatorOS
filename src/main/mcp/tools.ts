import type { BrowserKernel } from '../browser/BrowserKernel.js';

export function browserToolHandlers(browser: BrowserKernel) {
  return {
    list_profiles: async()=>browser.profiles.list(),
    list_tabs: async({profileId}:{profileId?:string})=>browser.tabs.list(profileId),
    open_tab: async({profileId,url}:{profileId?:string;url?:string})=>{const t=browser.createTab(profileId,url); return {id:t.id,profileId:t.profileId,url:t.url};},
    switch_tab: async({tabId}:{tabId:string})=>{browser.activateTab(tabId);return {ok:true};},
    navigate: async({url}:{url:string})=>{await browser.navigate(url);return {ok:true};},
    back: async()=>{browser.back();return {ok:true};},
    forward: async()=>{browser.forward();return {ok:true};},
    reload: async()=>{browser.reload();return {ok:true};},
    snapshot: async()=>browser.snapshot(),
    click: async({ref}:{ref:string})=>browser.click(ref),
    fill: async({ref,value}:{ref:string;value:string})=>browser.fill(ref,value),
    scroll: async({dx=0,dy=600}:{dx?:number;dy?:number})=>browser.scroll(dx,dy),
    evaluate: async({expression}:{expression:string})=>browser.evaluate(expression),
    screenshot: async()=>({dataUrl:await browser.screenshot()})
  };
}
