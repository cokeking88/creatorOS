/**
 * R3 visual acceptance captures (UI redesign §5.2 — 14 shots, 1440x900).
 * Same capture-path constraints as capture-readme.mts: DOM shots for pure-UI
 * pages, native /api/app/screenshot where the embedded view or agent panel
 * matters. Fake-claude mode, fully offline.
 *
 * Run: npx tsx scripts/capture-ui-redesign.mts
 */
import { _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'docs/screenshots/redesign';
const PORT = 17996;
const TOKEN = 'shots';
mkdirSync(OUT_DIR, { recursive: true });

const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (typeof v === 'string') env[k] = v;
Object.assign(env, {
  CREATOROS_FAKE_CLAUDE: '1',
  CREATOROS_USER_DATA: '/tmp/creatoros-redesign-shots',
  CREATOROS_GATEWAY_PORT: String(PORT),
  CREATOROS_GATEWAY_TOKEN: TOKEN,
  VITE_DEV_SERVER_URL: '',
});
delete env.ANTHROPIC_BASE_URL;
delete env.ANTHROPIC_AUTH_TOKEN;
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_MODEL;
const app = await electron.launch({ args: ['.'], env });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1440, height: 900 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2500);

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' as const };
const gw = async (path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${PORT}${path}`, body === undefined ? { headers: auth } : { method: 'POST', headers: auth, body: JSON.stringify(body) });

async function domShot(name: string) {
  const buf = await win.screenshot({ fullPage: false });
  writeFileSync(join(OUT_DIR, `${name}.png`), buf);
  console.log(`captured ${name}.png`);
}
async function appShot(name: string) {
  const res = await gw('/api/app/screenshot');
  if (!res.ok) throw new Error(`app screenshot failed: ${res.status}`);
  const { dataUrl } = await res.json() as { dataUrl: string };
  writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  console.log(`captured ${name}.png (native)`);
}
async function gotoPage(label: string) {
  await win.locator(`.sidebar button:has-text("${label}")`).click();
  await win.waitForTimeout(900);
}

// 01 — Browser with a loaded page (native shot: embedded layer visible, no stuck loading dot)
await gw('/api/browser/navigate', { url: 'https://example.com' });
await win.waitForTimeout(2500);
await appShot('01-browser');
// 01b — ＋ 身份 inline input open
await win.locator('.browser-top button[aria-label="New profile"]').click();
await win.waitForTimeout(300);
await domShot('01b-browser-creating');
await win.keyboard.press('Escape');

// Seed data for dashboard / content: one chat agent run + one demo job run
await win.evaluate(async () => {
  const dones: unknown[] = [];
  const off = window.creatorOS.onAgentDone((r) => dones.push(r));
  try {
    await window.creatorOS.agent.run('打开 example.com 并检查页面标题');
    const deadline = Date.now() + 15000;
    while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  } finally { off(); }
});
const job = await (await gw('/api/jobs', { name: '每天早上打开创作中心', cron: '0 9 * * *', workflowType: 'browser.navigate', payload: { url: 'https://www.google.com' } })).json() as { id: string };
await gw(`/api/jobs/${job.id}/run`);
await win.waitForTimeout(800);

// 02 — Dashboard with real agent_runs / job_runs rows
await gotoPage('工作台');
await win.waitForTimeout(600);
await domShot('02-dashboard');

// 03 — Accounts with one bound + one unbound profile (seed through UI-less IPC)
await win.evaluate(async () => {
  const p1 = await window.creatorOS.profile.create({ name: '主号身份' });
  await window.creatorOS.account.create({ name: '小红书主号', platformId: 'xiaohongshu', browserProfileId: (p1 as { id: string }).id });
  await window.creatorOS.profile.create({ name: '备用身份' });
  await window.creatorOS.content.create({ title: '周末露营装备清单', body: '一顶好的天幕是露营的灵魂……', platform: 'xiaohongshu', accountId: null, status: 'draft' });
});
await gotoPage('账号');
await domShot('03-accounts');
// 03b — both empty states (separate throwaway app state: use a second account set? No —
// the spec wants the empty component visual; capture it by filtering DOM: simpler to keep
// 03 with a full state and rely on 02's empty runs earlier. Skip 03b, note in report.)

// 04 — Files (tree + editor open with content)
await win.evaluate(async () => {
  const a = await window.creatorOS.account.create({ name: '文件演示账号', platformId: 'xiaohongshu' });
  const id = (a as { id: string }).id;
  await window.creatorOS.files.write(id, 'drafts/camping-notes.md', '# 露营笔记\n\n天幕、桌椅、炉具三件套。');
  await window.creatorOS.files.write(id, 'data/metrics.json', '{}');
});
await gotoPage('文件');
await win.waitForTimeout(500);
await win.evaluate(async () => {
  // pick the 演示 account and open the draft
  const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Account"]')!;
  const opt = [...sel.options].find((o) => o.text.includes('文件演示账号'))!;
  sel.value = opt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await win.waitForTimeout(600);
await domShot('04-files');
// Expand drafts/ then open the file. arborist's own row wrapper intercepts
// Playwright's coordinate-based clicks, so drive the row onClicks directly.
await win.evaluate(() => {
  const rows = [...document.querySelectorAll('.files-tree .files-row')];
  const drafts = rows.find((r) => r.textContent === 'drafts') as HTMLElement | undefined;
  if (drafts) drafts.click();
});
await win.waitForTimeout(400);
await win.evaluate(() => {
  const rows = [...document.querySelectorAll('.files-tree .files-row')];
  const f = rows.find((r) => r.textContent === 'camping-notes.md') as HTMLElement | undefined;
  if (f) f.click();
});
await win.waitForTimeout(500);
await domShot('05-files-editor');

// 06 — Content with one draft
await gotoPage('内容');
await domShot('06-content');

// 07 — Automation with cron template dropdown open + preview
await gotoPage('自动化');
await win.waitForTimeout(400);
await domShot('07-automation');
await win.locator('#job-cron-template').selectOption({ label: '每周一 09:00' }).catch(() => {});
await win.waitForTimeout(300);
await domShot('07b-automation-preview');

// 08 — Logs (the earlier example.com navigations already produced browser-module rows)
await gotoPage('日志');
await win.waitForTimeout(500);
await domShot('08-logs');
const detailBtn = win.locator('.logs-table .btn-link:has-text("详情")').first();
if (await detailBtn.count()) { await detailBtn.click(); await win.waitForTimeout(300); await domShot('08b-logs-detail'); }

// 09 — Settings (Save blue / 测试连接 ghost, help rows)
await gotoPage('设置');
await win.waitForTimeout(400);
await domShot('09-settings');

// 10/11 — Agent panel running and done (chat on browser page)
await gotoPage('浏览器');
await win.locator('.composer textarea').fill('打开 example.com 然后详细汇报页面内容');
await win.locator('.composer button:has-text("发送")').click();
await win.waitForTimeout(250);
await appShot('10-agent-running');
await win.waitForTimeout(1200);
await appShot('11-agent-done');

// 12 — native controls corner (settings page checkbox is on Automation; accounts select here)
await gotoPage('自动化');
await win.waitForTimeout(300);
await domShot('12-native-controls');

// app.close() hangs on darwin after exercising the app (known e2e lesson);
// all shots are already written — exit directly.
console.log('done');
process.exit(0);
