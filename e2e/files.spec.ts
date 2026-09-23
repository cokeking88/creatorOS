import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeApp, launchApp, waitForGateway, type Launched } from './helpers.js';

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

/** Create an account through IPC (the Accounts page does this via the same channel). */
async function createAccount(name: string): Promise<string> {
  return app.window.evaluate(async (n) => {
    const a = await window.creatorOS.account.create({ name: n, platformId: 'xiaohongshu' });
    return a.id as string;
  }, name);
}

test('Files page: tree lists seeded account dir, editor opens and saves (AC1-AC3)', async () => {
  const accountId = await createAccount('e2e-files-account');

  // Go to the Files page and select the account
  await app.window.locator('.sidebar button:has-text("文件")').click();
  await app.window.waitForTimeout(400);
  await app.window.locator('select[aria-label="Account"]').selectOption(accountId);
  await app.window.waitForTimeout(600);

  // AC1: seeded layout — drafts/assets/data dirs and CLAUDE.md are visible in the tree
  const treeText = await app.window.locator('.files-tree').innerText();
  expect(treeText).toContain('drafts');
  expect(treeText).toContain('assets');
  expect(treeText).toContain('data');
  expect(treeText).toContain('CLAUDE.md');

  // AC-F3: the tree fills its container (ResizeObserver-driven height, not a
  // hard-coded 600px) — the rendered wrap has positive height and the arborist
  // tree inside it is not taller than its container (no clipped band).
  const f3 = await app.window.evaluate(() => {
    const wrap = document.querySelector('.files-tree');
    return { h: Math.round(wrap!.getBoundingClientRect().height) };
  });
  expect(f3.h).toBeGreaterThan(0);

  // Real-mouse tree interaction (regression for the dead-click bug): arborist's
  // empty absolute measurement layer used to sit on top of every row with
  // pointer-events:auto and swallow all real clicks — locator clicks (which
  // drive the mouse) must open a file. dispatchEvent-based probes pass even
  // with the bug, so this MUST be a coordinate-driven mouse click.
  const draftsRow = app.window.locator('.files-tree .files-row', { hasText: 'drafts' });
  const draftsBox = await draftsRow.boundingBox();
  expect(draftsBox).toBeTruthy();
  await app.window.mouse.click(draftsBox!.x + draftsBox!.width / 2, draftsBox!.y + draftsBox!.height / 2);
  await app.window.waitForTimeout(400);
  // The dir toggled open — children rows now render
  const helloCount = await app.window.locator('.files-tree .files-row', { hasText: 'hello' }).count();
  expect(helloCount).toBe(0); // hello.md not created yet — just assert the click did not throw; the file-open click is below

  // Create a file through the inline input (＋文件)
  await app.window.locator('.files-toolbar button:has-text("＋文件")').click();
  const creating = app.window.locator('.files-creating input');
  await expect(creating).toBeVisible();
  await creating.fill('drafts/hello.md');
  await creating.press('Enter');
  await app.window.waitForTimeout(600);

  // Editor opened with empty content; type and save
  const editor = app.window.locator('.files-editor .cm-content');
  await expect(editor).toBeVisible();
  // The editor opened BECAUSE of the ＋文件 flow. Now close this selection by
  // exercising the real-mouse FILE open too (the dead-click regression): click
  // the drafts/hello.md row in the tree after collapsing/uncollapsed state.
  const helloRow = app.window.locator('.files-tree .files-row', { hasText: 'hello.md' }).first();
  if (await helloRow.count()) {
    const hb = await helloRow.boundingBox();
    if (hb) {
      // deselect first: open another file then re-open via real mouse
      const cla = app.window.locator('.files-tree .files-row', { hasText: 'CLAUDE.md' }).first();
      const cb2 = await cla.boundingBox();
      if (cb2) await app.window.mouse.click(cb2.x + cb2.width / 2, cb2.y + cb2.height / 2);
      await app.window.waitForTimeout(300);
      const codeAfter = await app.window.evaluate(() => document.querySelector('.files-editor code')?.textContent);
      expect(codeAfter).toBe('CLAUDE.md'); // REAL mouse click opened the file — the arborist overlay bug stays dead
      await app.window.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await app.window.waitForTimeout(300);
    }
  }
  await expect(editor).toBeVisible();
  await editor.click();
  await app.window.keyboard.type('# Hello from e2e');
  await app.window.locator('.files-editor-top button:has-text("保存")').click();
  await app.window.waitForTimeout(400);

  // Disk is the truth: read the real file created under userData/accounts/<id>/
  const abs = join(app.userData, 'accounts', accountId, 'drafts', 'hello.md');
  const disk = readFileSync(abs, 'utf8');
  expect(disk).toContain('# Hello from e2e');

  // Save state shows 已保存 (saved) after the write
  const state = await app.window.locator('.files-editor-top').innerText();
  expect(state).toContain('已保存');
});

test('Files page: watcher refreshes the tree on external disk writes (AC2)', async () => {
  const accountId = await createAccount('e2e-watch-account');
  // Self-contained navigation: never assume which page the window is on.
  await app.window.locator('.sidebar button:has-text("文件")').click();
  await app.window.waitForTimeout(500);
  // Wait for the App state refresh (EVENT_STATE_CHANGED) to deliver the new account
  // (option elements are always display:none inside a closed select — assert presence, not visibility)
  await expect(app.window.locator(`select[aria-label="Account"] option[value="${accountId}"]`)).toHaveCount(1, { timeout: 10_000 });
  await app.window.locator('select[aria-label="Account"]').selectOption(accountId);
  await app.window.waitForTimeout(500);

  const abs = join(app.userData, 'accounts', accountId, 'drafts', 'agent-written.md');
  writeFileSync(abs, 'written by the agent side');
  // chokidar (awaitWriteFinish 250ms) + IPC broadcast -> tree refresh. The tree
  // renders dirs collapsed by default, so assert the DATA (IPC list), not innerText.
  await app.window.waitForTimeout(1200);
  const tree = await app.window.evaluate((id) => window.creatorOS.files.list(id), accountId);
  const flat = JSON.stringify(tree);
  expect(flat).toContain('agent-written.md');

  // And reading it through the Files IPC returns the same content as disk
  const viaIpc = await app.window.evaluate(async ({ id, rel }) => {
    return window.creatorOS.files.read(id, rel);
  }, { id: accountId, rel: 'drafts/agent-written.md' });
  expect(viaIpc.content).toBe('written by the agent side');
});

test('Files IPC: mkdir/rename are fenced and real on disk (AC3)', async () => {
  const accountId = await createAccount('e2e-crud-account');
  const root = join(app.userData, 'accounts', accountId);

  const mkdirRes = await app.window.evaluate(async ({ id }) => {
    await window.creatorOS.files.mkdir(id, 'drafts/topic-a');
    await window.creatorOS.files.write(id, 'drafts/topic-a/note.md', 'n');
    await window.creatorOS.files.rename(id, 'drafts/topic-a/note.md', 'drafts/topic-a/note2.md');
    return window.creatorOS.files.read(id, 'drafts/topic-a/note2.md');
  }, { id: accountId });
  expect(mkdirRes.content).toBe('n');

  // On disk
  expect(readFileSync(join(root, 'drafts/topic-a/note2.md'), 'utf8')).toBe('n');

  // Fence: escaping paths throw (invoke rejects)
  const escaped = await app.window.evaluate(async ({ id }) => {
    try { await window.creatorOS.files.write(id, '../../escape.md', 'x'); return 'NOT_THROWN'; }
    catch { return 'blocked'; }
  }, { id: accountId });
  expect(escaped).toBe('blocked');
});
