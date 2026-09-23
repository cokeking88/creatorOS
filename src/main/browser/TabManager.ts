import { WebContentsView, type BrowserWindowConstructorOptions } from 'electron';
import { nanoid } from 'nanoid';
import type { BrowserTab } from '../../shared/types.js';
import type { ProfileManager } from './ProfileManager.js';

export type ManagedTab = BrowserTab & { view: WebContentsView };

export class TabManager {
  private tabs = new Map<string, ManagedTab>();
  constructor(
    private profiles: ProfileManager,
    private changed: () => void,
    private popupCreated?: (tab: ManagedTab, foreground: boolean) => void
  ) {}

  create(profileId: string, url = 'https://www.google.com'): ManagedTab {
    const ses = this.profiles.getSession(profileId);
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });
    const tab = this.register(profileId, view, url);
    void view.webContents.loadURL(url).catch(() => undefined);
    return tab;
  }

  private register(profileId: string, view: WebContentsView, url: string): ManagedTab {
    const tab: ManagedTab = { id: nanoid(), profileId, title: '新标签页', url, active: false, loading: true, view };
    this.tabs.set(tab.id, tab);
    const ses = this.profiles.getSession(profileId);

    view.webContents.setWindowOpenHandler((details) => ({
      action: 'allow',
      createWindow: (options: BrowserWindowConstructorOptions) => {
        const child = new WebContentsView({
          webPreferences: {
            session: ses,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        });
        const childTab = this.register(profileId, child, details.url || 'about:blank');
        const foreground = details.disposition !== 'background-tab';
        this.popupCreated?.(childTab, foreground);
        if (details.disposition === 'background-tab' && details.url) void child.webContents.loadURL(details.url).catch(() => undefined);
        return child.webContents;
      }
    }));

    view.webContents.on('page-title-updated', (_e, title) => { tab.title = title; this.changed(); });
    view.webContents.on('did-navigate', (_e, next) => { tab.url = next; this.changed(); void this.injectChromeFill(view.webContents); });
    view.webContents.on('did-navigate-in-page', (_e, next) => { tab.url = next; this.changed(); void this.injectChromeFill(view.webContents); });
    view.webContents.on('did-start-loading', () => { tab.loading = true; this.changed(); });
    view.webContents.on('did-stop-loading', () => { tab.loading = false; this.changed(); });
    view.webContents.on('render-process-gone', () => { tab.loading = false; this.changed(); });
    view.webContents.on('destroyed', () => { if (this.tabs.has(tab.id)) { this.tabs.delete(tab.id); this.changed(); } });
    this.changed();
    return tab;
  }

  list(profileId?: string): BrowserTab[] {
    return [...this.tabs.values()].filter(t => !profileId || t.profileId === profileId).map(({ view: _v, ...rest }) => ({ ...rest }));
  }
  get(id: string) { const t = this.tabs.get(id); if (!t) throw new Error(`Unknown tab: ${id}`); return t; }
  close(id: string) { const t = this.get(id); t.view.webContents.close(); this.tabs.delete(id); this.changed(); }
  allManaged() { return [...this.tabs.values()]; }

  /**
   * Chrome-object completeness (SECURITY.md #11 scope — presentation hygiene, not
   * spoofing): the session UA claims Chrome, but Electron leaves window.chrome's
   * runtime/app/csi/loadTimes members undefined, and that UA-vs-object mismatch is
   * itself an embedded tell (Google sign-in checks it). Runs in the MAIN world via
   * webContents.executeJavaScript on every navigation, idempotent, before the page's
   * own scripts interact on login flows. Standard member shapes with no-op semantics;
   * canvas/WebGL/audio fingerprints untouched; engine version never forged.
   */
  private injectChromeFill(wc: Electron.WebContents) {
    const fill = `(function(){if(window.chrome&&window.chrome.__creatorosFill)return;try{
      if(!window.chrome)window.chrome={};window.chrome.__creatorosFill=true;
      var noop=function(){};
      var c=window.chrome;
      if(!c.runtime)c.runtime={onConnect:{addListener:noop},onMessage:{addListener:noop},sendMessage:noop,connect:noop,id:undefined};
      if(!c.app)c.app={isInstalled:false,InstallState:{DISABLED:'disabled',INSTALLED:'installed',NOT_INSTALLED:'not_installed'},RunningState:{CANNOT_RUN:'cannot_run',READY_TO_RUN:'ready_to_run',RUNNING:'running'},getDetails:noop,getIsInstalled:noop};
      if(!c.csi)c.csi=function(){return{startE:Date.now(),onloadT:Date.now(),pageL:1,tran:15}};
      if(!c.loadTimes)c.loadTimes=function(){var t=Date.now()/1e3;return{requestTime:t,startLoadTime:t,commitLoadTime:t,finishDocumentLoadTime:t,finishLoadTime:t,firstPaintAfterLoadTime:0,firstPaintTime:t,navigationType:'Other',wasFasterViaSPDY:false,wasNpnNegotiated:true,wasAlternateProtocolAvailable:false,connectionInfo:'h2'}};
    }catch(e){}})();`;
    wc.executeJavaScript(fill, false).catch(() => undefined);
  }
}
