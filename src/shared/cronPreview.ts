/**
 * Cron UI preview + template dropdown (agent-capabilities §12.4 extraction 1:
 * moved verbatim from AutomationPage.tsx — function bodies unchanged, two pages
 * now consume it; page-to-page imports are forbidden in this repo, so it lives
 * in shared/ next to cronNext).
 */
import { parseCron, nextCronDate } from './cronNext.js';

/** 模板下拉的 value 直接是可提交的 cron；__custom 保留用户手输。 */
export const CRON_TEMPLATES = [
  { value: '0 9 * * *', label: '每天 09:00' },
  { value: '0 * * * *', label: '每小时' },
  { value: '0 9 * * 1', label: '每周一 09:00' },
] as const;

/** 下次运行预览：M月d日 HH:mm（本地时区）；无法解析/366 天内不触发各有专属文案。 */
export function cronPreview(expr: string): string | null {
  const f = parseCron(expr);
  if (!f) return null;
  return (() => { const n = nextCronDate(f, new Date()); if (!n) return null; const d = new Date(n); return `下次运行：${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();
}
