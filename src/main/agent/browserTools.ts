import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { BrowserKernel } from '../browser/BrowserKernel.js';

/** Truncate large tool outputs before they reach the model context. */
export const MAX_TOOL_RESULT_CHARS = 18_000;

function out(result: unknown) {
  const text = JSON.stringify(result);
  return { content: [{ type: 'text' as const, text: text.length > MAX_TOOL_RESULT_CHARS ? text.slice(0, MAX_TOOL_RESULT_CHARS) : text }] };
}

/**
 * The embedded-browser tool surface for the Claude agent, exposed as an
 * in-process SDK MCP server (no subprocess, no gateway HTTP hop).
 * Tool semantics mirror scripts/mcp-stdio.ts so internal and external
 * agents control the exact same BrowserKernel.
 */
export function createBrowserTools(kernel: BrowserKernel) {
  return [
    tool('browser_list_profiles', 'List persistent CreatorOS browser profiles', {}, async () => out(kernel.profiles.list()), { annotations: { readOnlyHint: true } }),
    tool('browser_list_tabs', 'List open tabs, optionally filtered by profile', { profileId: z.string().optional() }, async (a: { profileId?: string }) => out(kernel.tabs.list(a.profileId)), { annotations: { readOnlyHint: true } }),
    tool('browser_open_tab', 'Open a new tab in an internal persistent browser profile', { profileId: z.string().optional(), url: z.string().optional() }, async (a: { profileId?: string; url?: string }) => { const tab = kernel.createTab(a.profileId, a.url); return out({ id: tab.id, profileId: tab.profileId, url: tab.url }); }),
    tool('browser_switch_tab', 'Switch the visible internal tab', { tabId: z.string() }, async (a: { tabId: string }) => { kernel.activateTab(a.tabId); return out({ ok: true }); }),
    tool('browser_navigate', 'Navigate the active embedded tab. Never launch an external browser.', { url: z.string().min(1) }, async (a: { url: string }) => { await kernel.navigate(a.url); return out({ ok: true }); }),
    tool('browser_back', 'Go back in the active tab history', {}, async () => { kernel.back(); return out({ ok: true }); }),
    tool('browser_forward', 'Go forward in the active tab history', {}, async () => { kernel.forward(); return out({ ok: true }); }),
    tool('browser_reload', 'Reload the active page', {}, async () => { kernel.reload(); return out({ ok: true }); }),
    tool('browser_snapshot', 'Read the visible page (url/title/text) and assign element refs (e1, e2, ...) to interactive elements. Call before browser_click/browser_fill to get fresh refs.', {}, async () => out(await kernel.snapshot()), { annotations: { readOnlyHint: true } }),
    tool('browser_click', 'Click an element by its ref from the latest snapshot', { ref: z.string() }, async (a: { ref: string }) => { await kernel.click(a.ref); return out({ ok: true }); }),
    tool('browser_fill', 'Fill an input/textarea by its ref from the latest snapshot', { ref: z.string(), value: z.string() }, async (a: { ref: string; value: string }) => { await kernel.fill(a.ref, a.value); return out({ ok: true }); }),
    tool('browser_scroll', 'Scroll the active page', { dx: z.number().optional(), dy: z.number().optional() }, async (a: { dx?: number; dy?: number }) => out(await kernel.scroll(a.dx ?? 0, a.dy ?? 600))),
    tool('browser_evaluate', 'Evaluate JavaScript in the active embedded page. Use only when semantic tools are insufficient.', { expression: z.string() }, async (a: { expression: string }) => out({ result: await kernel.evaluate(a.expression) })),
    tool('browser_upload', 'Upload local files to a file input by its ref from the latest snapshot', { ref: z.string(), paths: z.array(z.string()).min(1) }, async (a: { ref: string; paths: string[] }) => out(await kernel.upload(a.ref, a.paths))),
    tool('browser_screenshot', 'Capture the active embedded page as a data URL (PNG). The window must be visible.', {}, async () => out({ dataUrl: await kernel.screenshot() }), { annotations: { readOnlyHint: true } }),
  ];
}
