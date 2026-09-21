import { BrowserWindow } from 'electron';
import { ProfileManager } from './ProfileManager.js';
import { TabManager } from './TabManager.js';
import type { BrowserSnapshot } from '../../shared/types.js';
import { logger } from '../services/logger.js';

export class BrowserKernel {
  private log = logger.child('browser');
  readonly profiles = new ProfileManager();
  readonly tabs: TabManager;
  private activeProfileId: string | null = null;
  private activeTabId: string | null = null;
  private bounds = { x: 248, y: 92, width: 800, height: 650 };

  constructor(private window: BrowserWindow, private changed: () => void) {
    this.tabs = new TabManager(this.profiles, () => { this.syncVisibility(); this.changed(); }, (tab, foreground) => { if (foreground) this.activateTab(tab.id); else this.changed(); });
  }

  bootstrap() {
    const p = this.profiles.list()[0] ?? this.profiles.create({ name: 'Main Creator' });
    this.activeProfileId = p.id;
    const t = this.tabs.create(p.id);
    this.activateTab(t.id);
  }
  get activeProfile() { return this.activeProfileId; }
  get activeTab() { return this.activeTabId; }

  activateProfile(profileId: string) {
    this.activeProfileId = profileId;
    const existing = this.tabs.list(profileId)[0];
    const tab = existing ? this.tabs.get(existing.id) : this.tabs.create(profileId);
    this.activateTab(tab.id);
  }
  createTab(profileId = this.requireProfile(), url?: string) { const t = this.tabs.create(profileId, url); this.activateTab(t.id); return t; }
  activateTab(tabId: string) { const t = this.tabs.get(tabId); this.activeProfileId = t.profileId; this.activeTabId = tabId; this.syncVisibility(); this.changed(); }
  closeTab(tabId: string) {
    const wasActive = this.activeTabId === tabId; const profileId = this.tabs.get(tabId).profileId; this.tabs.close(tabId);
    if (wasActive) { const next = this.tabs.list(profileId)[0]; this.activeTabId = next?.id ?? null; if (!next) this.createTab(profileId); else this.activateTab(next.id); }
  }
  setBounds(bounds: { x:number;y:number;width:number;height:number }) { this.bounds = bounds; this.syncVisibility(); }
  hideAll() { for (const t of this.tabs.allManaged()) this.detach(t.id); }
  showActive() { this.syncVisibility(); }

  private syncVisibility() {
    const all = this.tabs.allManaged();
    if (this.activeTabId && !all.some(t => t.id === this.activeTabId)) {
      const next = all.find(t => t.profileId === this.activeProfileId) ?? all[0];
      this.activeTabId = next?.id ?? null;
      if (next) this.activeProfileId = next.profileId;
    }
    for (const t of all) {
      t.active = t.id === this.activeTabId;
      if (t.active) {
        if (!this.window.contentView.children.includes(t.view)) this.window.contentView.addChildView(t.view);
        t.view.setBounds(this.bounds);
      } else this.detach(t.id);
    }
  }
  private detach(tabId: string) { const t = this.tabs.get(tabId); if (this.window.contentView.children.includes(t.view)) this.window.contentView.removeChildView(t.view); }
  private requireProfile() { if (!this.activeProfileId) throw new Error('No active profile'); return this.activeProfileId; }
  private current() { if (!this.activeTabId) throw new Error('No active tab'); return this.tabs.get(this.activeTabId); }

  async navigate(url: string) { let target = url.trim(); if (!/^https?:\/\//i.test(target)) target = `https://${target}`; this.log.info('navigate', { url: target, tabId: this.activeTabId }); await this.current().view.webContents.loadURL(target); }
  back() { const w = this.current().view.webContents; if (w.navigationHistory.canGoBack()) w.navigationHistory.goBack(); }
  forward() { const w = this.current().view.webContents; if (w.navigationHistory.canGoForward()) w.navigationHistory.goForward(); }
  reload() { this.current().view.webContents.reload(); }
  async evaluate<T=unknown>(expression: string): Promise<T> { return this.current().view.webContents.executeJavaScript(expression, true) as Promise<T>; }
  async screenshot(): Promise<string> { const image = await this.current().view.webContents.capturePage(); return image.toDataURL(); }
  async scroll(dx: number, dy: number) { return this.evaluate(`window.scrollBy(${JSON.stringify(dx)}, ${JSON.stringify(dy)}); true`); }

  async snapshot(): Promise<BrowserSnapshot> {
    this.log.debug('snapshot', { tabId: this.activeTabId });
    const script = `(() => {
      const esc=(s)=>String(s??'').replace(/\\s+/g,' ').trim().slice(0,200);
      let n=0; const els=[];
      for (const el of document.querySelectorAll('a,button,input,textarea,select,[role],[contenteditable="true"]')) {
        if (!(el instanceof HTMLElement)) continue;
        const r=el.getBoundingClientRect(); if (r.width<1||r.height<1) continue;
        const ref='e'+(++n); el.setAttribute('data-creatoros-ref',ref);
        els.push({ref,tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),name:esc(el.getAttribute('aria-label')||el.innerText||el.getAttribute('value')||el.getAttribute('name')),type:el.getAttribute('type'),placeholder:el.getAttribute('placeholder'),href:el.getAttribute('href'),disabled:Boolean(el.disabled)});
        if(n>=300) break;
      }
      return {url:location.href,title:document.title,text:esc(document.body?.innerText),elements:els};
    })()`;
    return this.evaluate<BrowserSnapshot>(script);
  }
  async click(ref: string) { this.log.info('click', { ref, tabId: this.activeTabId }); return this.evaluate(`(()=>{const e=document.querySelector('[data-creatoros-ref=${JSON.stringify(ref)}]'); if(!e) throw new Error('ref not found'); e.scrollIntoView({block:'center'}); e.click(); return true})()`); }
  async fill(ref: string, value: string) {
    this.log.info('fill', { ref, tabId: this.activeTabId });
    const encoded = JSON.stringify(value);
    return this.evaluate(`(()=>{const e=document.querySelector('[data-creatoros-ref=${JSON.stringify(ref)}]'); if(!e) throw new Error('ref not found'); e.focus(); if('value' in e) { const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value'); d?.set?.call(e,${encoded}); } else e.textContent=${encoded}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true})()`);
  }


  async upload(ref: string, paths: string[]) {
    if (!paths.length) throw new Error('No files provided');
    const dbg = await this.attachDebugger();
    const selector = `[data-creatoros-ref=${JSON.stringify(ref)}]`;
    const evaluated = await dbg.sendCommand('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})`, returnByValue: false });
    const objectId = (evaluated as any)?.result?.objectId;
    if (!objectId) throw new Error(`File input ref not found: ${ref}`);
    await dbg.sendCommand('DOM.setFileInputFiles', { files: paths, objectId });
    return { ok: true, count: paths.length };
  }

  async attachDebugger() {
    const wc = this.current().view.webContents;
    if (!wc.debugger.isAttached()) wc.debugger.attach();
    this.log.info('CDP attached', { tabId: this.activeTabId });
    return wc.debugger;
  }
}
