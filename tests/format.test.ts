import { describe, expect, it } from 'vitest';
import { fmtCost, fmtDur, toolLabel, TOOL_LABEL, relTime, fmtUpdate } from '../src/shared/format.js';

describe('fmtCost (§2.7 AP3)', () => {
  it('collapses sub-cent costs to <$0.01', () => {
    expect(fmtCost(0)).toBe('<$0.01');
    expect(fmtCost(0.009)).toBe('<$0.01');
    expect(fmtCost(0.009999)).toBe('<$0.01');
  });
  it('keeps exactly $0.01 at the boundary and formats to 2 decimals', () => {
    expect(fmtCost(0.01)).toBe('$0.01');
    expect(fmtCost(12.345)).toBe('$12.35'); // toFixed rounds
    expect(fmtCost(1)).toBe('$1.00');
    expect(fmtCost(123.4)).toBe('$123.40');
  });
});

describe('fmtDur (§2.7 AP3)', () => {
  it('collapses sub-100ms durations to <0.1s', () => {
    expect(fmtDur(0)).toBe('<0.1s');
    expect(fmtDur(99)).toBe('<0.1s');
  });
  it('100ms -> 0.1s; keeps one decimal via rounding', () => {
    expect(fmtDur(100)).toBe('0.1s');
    expect(fmtDur(1234)).toBe('1.2s');
    expect(fmtDur(950)).toBe('1s'); // Math.round(9.5)/10 = 10/10 -> '1s'
    expect(fmtDur(60000)).toBe('60s');
  });
});

describe('toolLabel (§2.7 AP1)', () => {
  it('strips the mcp__creatoros-browser__ prefix and maps to Chinese labels', () => {
    expect(toolLabel('mcp__creatoros-browser__browser_navigate')).toBe('打开页面');
    expect(toolLabel('mcp__creatoros-browser__browser_screenshot')).toBe('截图');
    expect(toolLabel('mcp__creatoros-browser__browser_switch_tab')).toBe('切换标签页');
  });
  it('maps built-in file tools', () => {
    expect(toolLabel('Read')).toBe('读文件');
    expect(toolLabel('Write')).toBe('写文件');
    expect(toolLabel('Edit')).toBe('编辑文件');
    expect(toolLabel('Glob')).toBe('搜索文件名');
    expect(toolLabel('Grep')).toBe('搜索内容');
  });
  it('passes unknown short names through (future tools degrade gracefully)', () => {
    expect(toolLabel('mcp__creatoros-browser__browser_new_thing')).toBe('browser_new_thing');
    expect(toolLabel('Task')).toBe('Task');
  });
  it('empty / undefined -> empty string', () => {
    expect(toolLabel(undefined)).toBe('');
    expect(toolLabel('')).toBe('');
  });
  it('TOOL_LABEL covers the 15 browser tools + 5 file tools', () => {
    const browser = Object.keys(TOOL_LABEL).filter(k => k.startsWith('browser_'));
    expect(browser.length).toBe(15);
    expect(Object.keys(TOOL_LABEL).length).toBe(20);
  });
});

/** §12.4 extraction 3: relTime/fmtUpdate moved verbatim from Dashboard.tsx / ContentPage.tsx. */
describe('relTime (§12.4)', () => {
  it('sub-minute -> 刚刚', () => {
    expect(relTime(Date.now())).toBe('刚刚');
    expect(relTime(Date.now() - 30_000)).toBe('刚刚');
  });
  it('59s boundary stays 刚刚; 60s flips to N 分钟前', () => {
    expect(relTime(Date.now() - 59_000)).toBe('刚刚');
    expect(relTime(Date.now() - 60_000)).toBe('1 分钟前');
    expect(relTime(Date.now() - 119_000)).toBe('1 分钟前');
  });
  it('minutes / hours / days buckets', () => {
    expect(relTime(Date.now() - 5 * 60_000)).toBe('5 分钟前');
    expect(relTime(Date.now() - 59 * 60_000)).toBe('59 分钟前');
    expect(relTime(Date.now() - 60 * 60_000)).toBe('1 小时前');
    expect(relTime(Date.now() - 23 * 3_600_000)).toBe('23 小时前');
    expect(relTime(Date.now() - 24 * 3_600_000)).toBe('1 天前');
    expect(relTime(Date.now() - 3 * 86_400_000)).toBe('3 天前');
  });
});

describe('fmtUpdate (§12.4)', () => {
  it('formats a fixed timestamp as YYYY-MM-DD HH:mm with zero padding', () => {
    // Local timezone: construct the date the same way fmtUpdate reads it back.
    const d = new Date(2026, 0, 5, 9, 7, 0, 0); // 2026-01-05 09:07 local
    expect(fmtUpdate(d.getTime())).toBe('2026-01-05 09:07');
  });
  it('pads single-digit month/day/hour/minute', () => {
    const d = new Date(2026, 10, 1, 3, 2, 0, 0); // 2026-11-01 03:02 local
    expect(fmtUpdate(d.getTime())).toBe('2026-11-01 03:02');
  });
  it('double-digit values pass through unpadded', () => {
    const d = new Date(2026, 11, 25, 14, 30, 0, 0);
    expect(fmtUpdate(d.getTime())).toBe('2026-12-25 14:30');
  });
});
