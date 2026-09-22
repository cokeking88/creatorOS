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
    view.webContents.on('did-navigate', (_e, next) => { tab.url = next; this.changed(); });
    view.webContents.on('did-navigate-in-page', (_e, next) => { tab.url = next; this.changed(); });
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
}
