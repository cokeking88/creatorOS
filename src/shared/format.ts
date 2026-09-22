/**
 * Shared display formatting (UI redesign spec §2.7 / §7.1).
 * Used by AgentPanel step lines and the Dashboard run lists.
 */

/** $0.0000 -> <$0.01; anything below one cent collapses to <$0.01, else 2 decimals. */
export function fmtCost(v: number): string { return v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`; }

/** Sub-100ms durations collapse to <0.1s; else one decimal (1234ms -> 1.2s). */
export function fmtDur(v: number): string { return v < 100 ? '<0.1s' : `${Math.round(v / 100) / 10}s`; }

/** Built-in tool display names (AP1). Unknown short names pass through; empty -> ''. */
export const TOOL_LABEL: Record<string, string> = {
  'browser_navigate': '打开页面', 'browser_snapshot': '读取页面', 'browser_click': '点击',
  'browser_fill': '填写', 'browser_scroll': '滚动', 'browser_evaluate': '执行脚本',
  'browser_upload': '上传文件', 'browser_screenshot': '截图', 'browser_list_profiles': '列出身份',
  'browser_list_tabs': '列出标签页', 'browser_open_tab': '新开标签页', 'browser_switch_tab': '切换标签页',
  'browser_back': '后退', 'browser_forward': '前进', 'browser_reload': '刷新',
  'Read': '读文件', 'Write': '写文件', 'Edit': '编辑文件', 'Glob': '搜索文件名', 'Grep': '搜索内容',
};

export function toolLabel(tool?: string): string {
  if (!tool) return '';
  const short = tool.replace(/^mcp__creatoros-browser__/, '');
  return TOOL_LABEL[short] ?? short;
}

/** Compact relative time: 刚刚 / N 分钟前 / N 小时前 / N 天前 (caption-style sub info). §12.4 extraction 3 — moved verbatim from Dashboard.tsx. */
export function relTime(t: number): string {
  const diff = Date.now() - t; const m = Math.floor(diff / 60000); if (m < 1) return '刚刚'; if (m < 60) return `${m} 分钟前`; const h = Math.floor(m / 60); if (h < 24) return `${h} 小时前`; return `${Math.floor(h / 24)} 天前`;
}

/** Absolute timestamp YYYY-MM-DD HH:mm. §12.4 extraction 3 — moved verbatim from ContentPage.tsx. */
export function fmtUpdate(t: number): string {
  const d = new Date(t); const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
