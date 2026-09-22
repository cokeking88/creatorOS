/**
 * README screenshots — drives the real app via Playwright, navigates every
 * page through the sidebar, captures window screenshots into docs/screenshots.
 *
 * Capture paths and their limits (verified 2026-09-22):
 *  - Playwright page.screenshot() renders the main window DOM but NOT the
 *    native WebContentsView layer.
 *  - win.webContents.capturePage() (gateway /api/app/screenshot) also misses
 *    child WebContentsView layers — the embedded page shows as the DOM placeholder.
 *  - The embedded page itself is captured via /api/browser/screenshot
 *    (BrowserKernel.capturePage on the active tab's webContents).
 * So the Browser page gets two images: the app chrome and the embedded page.
 *
 * The embedded tab is navigated to example.com via the gateway before capture.
 *
 * Run: npx tsx scripts/capture-readme.mts   (fake-claude mode, fully offline)
 */
import { _electron as electron } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = process.env.CREATOROS_SHOT_DIR ?? 'docs/screenshots';
const PORT = 17995;
const TOKEN = 'shots';
mkdirSync(OUT_DIR, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    CREATOROS_FAKE_CLAUDE: '1',
    CREATOROS_USER_DATA: '/tmp/creatoros-readme-shots',
    CREATOROS_GATEWAY_PORT: String(PORT),
    CREATOROS_GATEWAY_TOKEN: TOKEN,
  },
});
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1440, height: 900 });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(2500);

const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' as const };

/** Native capturePage of the main window (app chrome; embedded view shows placeholder). */
async function appShot(name: string) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/app/screenshot`, { headers: auth });
  if (!res.ok) throw new Error(`app screenshot failed: ${res.status}`);
  const { dataUrl } = await res.json() as { dataUrl: string };
  writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  console.log(`captured ${name}.png (app window)`);
}

/** Embedded page content (BrowserKernel.capturePage on the active tab). */
async function pageShot(name: string) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/browser/screenshot`, { headers: auth });
  if (!res.ok) throw new Error(`browser screenshot failed: ${res.status}`);
  const { dataUrl } = await res.json() as { dataUrl: string };
  writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
  console.log(`captured ${name}.png (embedded page)`);
}

/** DOM capture for pure-UI pages. */
async function domShot(name: string) {
  const buf = await win.screenshot({ fullPage: false });
  writeFileSync(join(OUT_DIR, `${name}.png`), buf);
  console.log(`captured ${name}.png (dom)`);
}

/** Click a sidebar button by its visible label. */
async function gotoPage(label: string) {
  await win.locator(`.sidebar button:has-text("${label}")`).click();
  await win.waitForTimeout(900);
}

// Browser page: navigate the embedded tab to the fixture target, then capture both layers.
await fetch(`http://127.0.0.1:${PORT}/api/browser/navigate`, { method: 'POST', headers: auth, body: JSON.stringify({ url: 'https://example.com' }) });
await win.waitForTimeout(2500);
await appShot('browser');
await pageShot('browser-embedded');

await gotoPage('Dashboard');
await domShot('dashboard');
await gotoPage('Accounts');
await domShot('accounts');
await gotoPage('Content');
await domShot('content');
await gotoPage('Automation');
await domShot('automation');
await gotoPage('Logs');
await domShot('logs');
await gotoPage('Settings');
await domShot('settings');

// Agent panel with a streamed run (chat on the Browser page; embedded page visible in chrome).
await gotoPage('Browser');
await win.locator('.composer textarea').fill('打开 example.com 并汇报页面内容');
await win.locator('.composer button:has-text("发送")').click();
await win.waitForTimeout(180);
await appShot('agent-steps');
await win.waitForTimeout(600);
await appShot('agent-done');

await app.close();
console.log('done');
process.exit(0);
