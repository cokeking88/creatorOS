import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeApp, expect, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC-S2 (agent-capabilities §7.2) — skills page CRUD through the real UI:
 * form creates a skill (list row appears), edit renames it, the two-step
 * delete removes the SQLite row, and the AgentPanel empty-state skill chip
 * fills the composer WITHOUT sending (§2.3 入口 1). Offline fake mode;
 * every test seeds its own data (self-contained per worker restart).
 */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

function readDb(userData: string) {
  const db = new DatabaseSync(join(userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  return {
    skills: () => db.prepare('SELECT id, name, description, prompt_template, origin FROM skills').all() as Array<Record<string, string>>,
    close: () => db.close(),
  };
}

/** Navigate the sidebar to the skills page and wait for it to mount. */
async function openSkillsPage(): Promise<void> {
  await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.sidebar button', '技能')!.click();
    for (let i = 0; i < 50 && document.querySelector('.page h1')?.textContent !== '技能'; i++) await sleep(50);
  });
}

/** React-controlled value set helper source — evaluated inside the page context. */
const setValSource = `(el, v) => {
  const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}`;

test('fresh app: skills page renders the empty state alongside the writable form', async () => {
  await openSkillsPage();
  const ui = await app.window.evaluate(() => {
    const emptyTitle = document.querySelector('.page .empty b')?.textContent;
    const formH2 = document.querySelector('.skill-form h2')?.textContent;
    const saveBtn = [...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存技能');
    return { emptyTitle: emptyTitle ?? null, formH2: formH2 ?? null, hasSave: Boolean(saveBtn) };
  });
  expect(ui.emptyTitle).toBe('还没有技能');
  expect(ui.formH2).toBe('新建技能');
  expect(ui.hasSave).toBe(true);
});

test('form creates a skill: list row, app:state projection, SQLite row', async () => {
  await openSkillsPage();
  const created = await app.window.evaluate(async (setValSrc: string) => {
    const setVal = new Function('return (' + setValSrc + ')')() as (el: HTMLInputElement | HTMLTextAreaElement, v: string) => void;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setVal(document.querySelector<HTMLInputElement>('#skill-name')!, 'e2e-login-check');
    setVal(document.querySelector<HTMLInputElement>('#skill-desc')!, '每天检查登录态');
    setVal(document.querySelector<HTMLTextAreaElement>('#skill-template')!, '打开 {账号} 的创作中心并截图');
    ([...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存技能') as HTMLElement).click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const state = await window.creatorOS.state();
      const s = (state.skills as Array<{ name: string; promptTemplate: string }>).find((x) => x.name === 'e2e-login-check');
      if (s) return s;
      if (Date.now() > deadline) throw new Error('skill never appeared in state');
      await sleep(100);
    }
  }, setValSource);
  expect(created.promptTemplate).toBe('打开 {账号} 的创作中心并截图');

  // List row shows name, description fallback copy rules, and updated time.
  const row = await app.window.evaluate(() => {
    const item = document.querySelector('.skill-item');
    return {
      name: item?.querySelector('b')?.textContent ?? null,
      text: item?.textContent ?? '',
      originPill: item?.querySelector('.pill.info')?.textContent ?? null,
      actions: [...(item?.querySelectorAll('.skill-item-actions button') ?? [])].map((b) => b.getAttribute('aria-label') ?? b.textContent),
    };
  });
  expect(row.name).toBe('e2e-login-check');
  expect(row.text).toContain('每天检查登录态');
  expect(row.text).toContain('更新于');
  expect(row.originPill).toBeNull(); // UI-created skills are origin='manual' — NO badge (low-noise rule)
  expect(row.actions).toContain('删除技能 e2e-login-check');

  // SQLite truth: manual origin, full field roundtrip.
  const db = readDb(app.userData);
  try {
    const rows = db.skills();
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ name: 'e2e-login-check', description: '每天检查登录态', prompt_template: '打开 {账号} 的创作中心并截图', origin: 'manual' });
  } finally { db.close(); }
});

test('empty form submit is gated: invalid fields disable the button and show the err-msg', async () => {
  await openSkillsPage();
  const ui = await app.window.evaluate(() => {
    const save = [...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存技能') as HTMLButtonElement;
    save.click(); // disabled click does nothing; assert the disabled + hint state instead
    const err = [...document.querySelectorAll('.skill-form .err-msg')].map((e) => e.textContent);
    return { disabled: save.disabled, err };
  });
  expect(ui.disabled).toBe(true);
  expect(ui.err).toContain('请填写名称和指令模板');
});

test('edit renames the skill; two-step delete then removes the SQLite row', async () => {
  // Seed through the IPC face (form already covered above), then edit via UI.
  await app.window.evaluate(async () => {
    await window.creatorOS.skills.create({ name: 'e2e-edit-me', description: '', promptTemplate: '巡检登录态' });
  });
  await openSkillsPage();

  // Edit: form switches to 编辑：{name}, fields backfilled, button reads 保存修改.
  const beforeEdit = await app.window.evaluate(async (setValSrc: string) => {
    const setVal = new Function('return (' + setValSrc + ')')() as (el: HTMLInputElement, v: string) => void;
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.skill-item-actions button', '编辑')!.click();
    await new Promise((r) => setTimeout(r, 50));
    const name = document.querySelector<HTMLInputElement>('#skill-name')!;
    setVal(name, 'e2e-edited');
    ([...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存修改') as HTMLElement).click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const state = await window.creatorOS.state();
      if ((state.skills as Array<{ name: string }>).some((s) => s.name === 'e2e-edited')) return true;
      if (Date.now() > deadline) throw new Error('rename never landed in state');
      await new Promise((r) => setTimeout(r, 100));
    }
  }, setValSource);
  expect(beforeEdit).toBe(true);

  // Two-step delete: first click arms (确认删除？, row stays), second click deletes.
  const del = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sel = '.skill-item .btn-danger[aria-label="删除技能 e2e-edited"]';
    const btn = document.querySelector<HTMLButtonElement>(sel)!;
    btn.click();
    await sleep(50);
    const armed = { text: btn.textContent ?? '', stillThere: (await window.creatorOS.state()).skills.some((s: { name: string }) => s.name === 'e2e-edited') };
    document.querySelector<HTMLButtonElement>(sel)!.click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const skills = (await window.creatorOS.state()).skills as Array<{ name: string }>;
      if (!skills.some((s) => s.name === 'e2e-edited')) return { armed, gone: true };
      if (Date.now() > deadline) return { armed, gone: false };
      await sleep(100);
    }
  });
  expect(del.armed.text).toContain('确认删除？');
  expect(del.armed.stillThere).toBe(true);
  expect(del.gone).toBe(true);

  const db = readDb(app.userData);
  try { expect(db.skills().filter((r) => r.name === 'e2e-edited')).toEqual([]); } finally { db.close(); }
});

test('deleting a skill that a job references shows the bound-count hint (warn, not block)', async () => {
  const bound = await app.window.evaluate(async () => {
    await window.creatorOS.skills.create({ name: 'e2e-bound-skill', description: '', promptTemplate: '被引用的技能' });
    await window.creatorOS.jobs.create({ name: 'e2e-binding-job', cron: '0 9 * * *', workflowType: 'agent.run', payload: { skillId: (await window.creatorOS.state()).skills.find((s: { name: string }) => s.name === 'e2e-bound-skill')!.id, prompt: null } });
    return true;
  });
  expect(bound).toBe(true);
  await openSkillsPage();
  const hint = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const sel = '.skill-item .btn-danger[aria-label="删除技能 e2e-bound-skill"]';
    for (let i = 0; i < 50 && !document.querySelector(sel); i++) await sleep(50);
    document.querySelector<HTMLButtonElement>(sel)!.click();
    await sleep(50);
    const hint = document.querySelector('.skill-del-hint')?.textContent ?? null;
    const stillThere = (await window.creatorOS.state()).skills.some((s: { name: string }) => s.name === 'e2e-bound-skill');
    return { hint, stillThere };
  });
  // 提示不拦截 (§9.5): first click only arms and shows the hint; the row survives.
  expect(hint.hint).toBe('该技能被 1 个定时任务引用，删除后这些任务将运行失败');
  expect(hint.stillThere).toBe(true);
  // Clean up: complete the deletion so later tests see a clean list via state.
  await app.window.evaluate(async () => {
    const sel = '.skill-item .btn-danger[aria-label="删除技能 e2e-bound-skill"]';
    document.querySelector<HTMLButtonElement>(sel)!.click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const skills = (await window.creatorOS.state()).skills as Array<{ name: string }>;
      if (!skills.some((s) => s.name === 'e2e-bound-skill')) return;
      if (Date.now() > deadline) throw new Error('delete never landed');
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});

test('AgentPanel empty-state skill chip fills the composer WITHOUT sending', async () => {
  // A fresh panel (no items) + at least one skill -> 「运行技能」 group renders.
  await app.window.evaluate(async () => {
    await window.creatorOS.skills.create({ name: 'e2e-chip-skill', description: 'chips 填入不发送', promptTemplate: '打开 {账号} 的创作中心，检查登录态并截图' });
  });
  const ui = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // Wait for the chip to appear (panel refetches skills on state change).
    let chip: HTMLElement | null = null;
    for (let i = 0; i < 50; i++) {
      chip = [...document.querySelectorAll<HTMLElement>('.empty-suggest button')].find((b) => b.textContent === 'e2e-chip-skill') ?? null;
      if (chip) break;
      await sleep(100);
    }
    if (!chip) return { found: false };
    const beforeItems = document.querySelectorAll('.agent .step-group').length;
    chip!.click();
    await sleep(100);
    const composer = document.querySelector<HTMLTextAreaElement>('.composer textarea')!;
    return {
      found: true,
      composerValue: composer.value,
      afterItems: document.querySelectorAll('.agent .step-group').length,
      groupLabel: [...document.querySelectorAll('.empty-suggest-label')].map((l) => l.textContent),
    };
  });
  expect(ui.found).toBe(true);
  expect((ui as { composerValue: string }).composerValue).toBe('打开 {账号} 的创作中心，检查登录态并截图');
  // NOT sent: no run item appeared (§2.3 入口 1 — chips fill the draft, never auto-send).
  expect((ui as { afterItems: number }).afterItems).toBe(0);
  expect((ui as { groupLabel: string[] }).groupLabel).toContain('运行技能');
});
