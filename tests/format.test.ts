import { describe, expect, it } from 'vitest';
import { fmtCost, fmtDur, toolLabel, TOOL_LABEL } from '../src/shared/format.js';

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
