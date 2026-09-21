import { _electron as electron } from '@playwright/test';
const app = await electron.launch({ args: ['.'], env: { ...process.env, CREATOROS_USER_DATA: '/tmp/creatoros-debug-flow', CREATOROS_GATEWAY_PORT: '17997', CREATOROS_GATEWAY_TOKEN: 'dbg', CREATOROS_AGENT_PROVIDER: 'mock', ANTHROPIC_MODEL: 'fuyao/fuyao-work[1m]' } });
const win = await app.firstWindow();
await win.waitForLoadState('domcontentloaded');
await new Promise((r) => setTimeout(r, 2500));
// exactly like e2e test2: set + chat in ONE evaluate
const r2 = await win.evaluate(async () => {
  const cfg = await window.creatorOS.settings.set({ provider: 'openai-compatible', compatBaseUrl: 'http://127.0.0.1:1/none', compatKey: 'fake-key', compatModel: 'fake-model' });
  let chat;
  try { const c = await window.creatorOS.agent.chat([{ role: 'user', content: 'ping' }]); chat = { ok: true, provider: c.provider }; }
  catch (e) { chat = { ok: false, error: String(e).slice(0, 80) }; }
  const after = await window.creatorOS.settings.get();
  return { setProvider: cfg.provider, chat, afterProvider: after.provider, afterCfg: JSON.stringify(after) };
});
console.log('TEST2 SIM:', JSON.stringify(r2, null, 1));
await app.close();
process.exit(0);
