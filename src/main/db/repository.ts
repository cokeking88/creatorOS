import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from './index.js';
import { accounts, browserProfiles, contents, jobs, platforms } from './schema.js';
import type { AccountRecord, BrowserProfile, ContentItem, JobRecord, PlatformRecord } from '../../shared/types.js';

export const repo = {
  listPlatforms(): PlatformRecord[] { return db.select().from(platforms).orderBy(platforms.name).all() as PlatformRecord[]; },
  listAccounts(): AccountRecord[] { return db.select().from(accounts).orderBy(desc(accounts.updatedAt)).all() as AccountRecord[]; },
  createAccount(input: { name:string; platformId:string; handle?:string; browserProfileId?:string }): AccountRecord {
    const now=Date.now(); const row={id:nanoid(),platformId:input.platformId,name:input.name,handle:input.handle??null,browserProfileId:input.browserProfileId??null,createdAt:now,updatedAt:now};
    db.insert(accounts).values(row).run();
    if (row.browserProfileId) { const platform=this.listPlatforms().find(p=>p.id===row.platformId); db.update(browserProfiles).set({accountId:row.id,platform:platform?.key??row.platformId,updatedAt:now}).where(eq(browserProfiles.id,row.browserProfileId)).run(); }
    return row;
  },
  listProfiles(): BrowserProfile[] {
    return db.select().from(browserProfiles).orderBy(desc(browserProfiles.updatedAt)).all();
  },
  createProfile(input: { name: string; platform?: string; accountId?: string }): BrowserProfile {
    const now = Date.now();
    const row = { id: nanoid(), name: input.name, partition: `persist:profile-${nanoid(10)}`, platform: input.platform ?? null, accountId: input.accountId ?? null, createdAt: now, updatedAt: now };
    db.insert(browserProfiles).values(row).run(); return row;
  },
  listContents(): ContentItem[] { return db.select().from(contents).orderBy(desc(contents.updatedAt)).all() as ContentItem[]; },
  createContent(input: Pick<ContentItem, 'title'|'body'|'platform'> & Partial<ContentItem>): ContentItem {
    const now = Date.now();
    const row = { id: nanoid(), title: input.title, body: input.body, platform: input.platform, accountId: input.accountId ?? null, status: input.status ?? 'draft', scheduledAt: input.scheduledAt ?? null, publishedUrl: input.publishedUrl ?? null, createdAt: now, updatedAt: now };
    db.insert(contents).values(row).run(); return row as ContentItem;
  },
  updateContent(id: string, patch: Partial<ContentItem>) {
    db.update(contents).set({ ...patch, updatedAt: Date.now() }).where(eq(contents.id, id)).run();
  },
  listJobs(): JobRecord[] {
    return db.select().from(jobs).orderBy(desc(jobs.updatedAt)).all().map((j: typeof jobs.$inferSelect) => ({ id: j.id, name: j.name, cron: j.cron, enabled: j.enabled, workflowType: j.workflowType, payload: JSON.parse(j.payloadJson || '{}'), lastRunAt: j.lastRunAt, createdAt: j.createdAt, updatedAt: j.updatedAt }));
  },
  createJob(input: { name: string; cron: string; workflowType: string; payload?: Record<string, unknown> }): JobRecord {
    const now = Date.now(); const id = nanoid();
    db.insert(jobs).values({ id, name: input.name, cron: input.cron, enabled: true, workflowType: input.workflowType, payloadJson: JSON.stringify(input.payload ?? {}), createdAt: now, updatedAt: now }).run();
    return { id, name: input.name, cron: input.cron, enabled: true, workflowType: input.workflowType, payload: input.payload ?? {}, createdAt: now, updatedAt: now };
  },
  toggleJob(id: string, enabled: boolean) { db.update(jobs).set({ enabled, updatedAt: Date.now() }).where(eq(jobs.id, id)).run(); },
  markJobRun(id: string) { db.update(jobs).set({ lastRunAt: Date.now(), updatedAt: Date.now() }).where(eq(jobs.id, id)).run(); }
};
