import { describe, expect, it } from 'vitest';
import { CRON_TEMPLATES, cronPreview } from '../src/shared/cronPreview.js';

/**
 * cronPreview + CRON_TEMPLATES (agent-capabilities §12.4 extraction 1): moved
 * verbatim from AutomationPage.tsx, now shared by both the Automation form and
 * the skills bind form. These cases pin the three preview states so the two
 * pages can never drift (same function, same copy, §12.5 #16).
 */

describe('CRON_TEMPLATES (shared dropdown source)', () => {
  it('exposes the three template rows with submit-ready values', () => {
    expect(CRON_TEMPLATES).toEqual([
      { value: '0 9 * * *', label: '每天 09:00' },
      { value: '0 * * * *', label: '每小时' },
      { value: '0 9 * * 1', label: '每周一 09:00' },
    ]);
    for (const t of CRON_TEMPLATES) expect(cronPreview(t.value)).not.toBeNull();
  });
});

describe('cronPreview three states (§12.5 #16 copy)', () => {
  it('supported expression -> 下次运行：M月d日 HH:mm', () => {
    const p = cronPreview('0 9 * * *');
    expect(p).toMatch(/^下次运行：\d{1,2}月\d{1,2}日 \d{2}:\d{2}$/);
  });
  it('every-hour template previews on the next full hour', () => {
    expect(cronPreview('0 * * * *')).toMatch(/^下次运行：/);
  });
  it('malformed / unsupported expression -> null (page shows 无法预览该表达式)', () => {
    expect(cronPreview('not a cron')).toBeNull();
    expect(cronPreview('@daily')).toBeNull();
    expect(cronPreview('*/5 * * * * *')).toBeNull(); // 6-field seconds
    expect(cronPreview('')).toBeNull();
  });
  it('impossible date inside the 366-day window -> null (366 天内不会触发)', () => {
    // Feb 30 never exists.
    expect(cronPreview('0 0 30 2 *')).toBeNull();
  });
});
