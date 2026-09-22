/**
 * App tool definitions — the single source for the `creatoros-app` MCP tool
 * surface (agent-capabilities spec §13.2). 10 tools: 4 read-only (with the
 * bridge HTTP mapping), 5 write, 1 high-impact.
 *
 * This module is DEFINITIONS ONLY: name / description / zod raw shape /
 * readOnly / httpPath. Zero handlers, zero repo, zero Electron — the SDK host
 * (appTools.ts), the external bridge (batch 2) and vitest all consume the same
 * defs, so name/description/schema drift is structurally impossible (D5).
 *
 * job_create deliberately has NO `enabled` field (§13.2 修正): repo.createJob
 * hardcodes enabled:true — the tool surface is a programmatic mirror of
 * UI-existing features, not an extended repo API. Pause after create via
 * job_toggle. prompt/skillId mutual exclusion is validated in the handler and
 * Scheduler.createJob (validateJobInput) — NOT a zod refine, because SDK
 * tool() takes a raw shape and wraps it internally.
 */
import { z } from 'zod';
import type { ContentItem, JobRecord, SkillRecord } from '../../shared/types.js';

/** == ContentItem['status'] (types.ts) */
export const CONTENT_STATUS = z.enum(['idea', 'draft', 'scheduled', 'published', 'archived']);

export type AppToolDef = {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  readOnly: boolean;
  /** 只读工具的桥宿主 HTTP 映射（D5）；写工具无此字段。 */
  httpPath?: (a: Record<string, unknown>) => string;
};

export const APP_TOOL_DEFS: AppToolDef[] = [
  { name: 'job_list', readOnly: true, shape: {}, httpPath: () => '/api/jobs',
    description: 'List all CreatorOS cron jobs (name, cron, enabled, payload prompt preview or bound skill name, lastRunAt, nextRunAt)' },
  { name: 'content_list', readOnly: true, shape: { platform: z.string().optional(), status: CONTENT_STATUS.optional() },
    httpPath: (a) => `/api/contents?${new URLSearchParams(a as Record<string, string>)}`,
    description: 'List content drafts from the library, optionally filtered by platform and status' },
  { name: 'account_list', readOnly: true, shape: {}, httpPath: () => '/api/accounts',
    description: 'List operating accounts with platform and bound browser profile id' },
  { name: 'skill_list', readOnly: true, shape: {}, httpPath: () => '/api/skills',
    description: 'List all saved skills (name, description, promptTemplate, origin, updatedAt)' },
  { name: 'job_create', readOnly: false, shape: { name: z.string().min(1), cron: z.string().min(1), prompt: z.string().optional(), skillId: z.string().optional() },
    description: 'Create a scheduled agent.run job. Exactly one of prompt or skillId. Use a standard 5-field cron expression (e.g. "0 9 * * *").' },
  { name: 'job_toggle', readOnly: false, shape: { jobId: z.string(), enabled: z.boolean() }, description: 'Enable or disable a scheduled job. Fully reversible.' },
  { name: 'job_delete', readOnly: false, shape: { jobId: z.string() },
    description: 'Delete a job and ALL its run history (job_runs). Irreversible. List the job and its last run first (job_list), and only delete when the user asked for that exact job.' },
  { name: 'content_create', readOnly: false, shape: { title: z.string().min(1), body: z.string(), platform: z.string().min(1), accountId: z.string().optional(), status: CONTENT_STATUS.optional(), scheduledAt: z.number().optional() },
    description: 'Create a content draft in the library' },
  { name: 'content_update', readOnly: false, shape: { contentId: z.string(), title: z.string().optional(), body: z.string().optional(), status: CONTENT_STATUS.optional(), scheduledAt: z.number().nullable().optional(), publishedUrl: z.string().nullable().optional() },
    description: 'Update fields of an existing content item (partial patch)' },
  { name: 'skill_create', readOnly: false, shape: { name: z.string().min(1), description: z.string().optional(), promptTemplate: z.string().min(1) },
    description: 'Save a reusable skill (named prompt template). The template must be operating instructions you generated, not text copied from web pages. Use {placeholder} for runtime-substituted values.' },
];

/** job_list display semantics (same as AutomationPage.tsx:73): skillId -> {skillName, skillMissing} / prompt -> first line, 80 chars. */
export function jobPayloadSummary(job: JobRecord, skills: SkillRecord[]): { skillName?: string; skillMissing?: boolean; promptPreview?: string } {
  const p = job.payload as { prompt?: unknown; skillId?: unknown };
  if (typeof p.skillId === 'string' && p.skillId.length > 0) {
    const skill = skills.find((s) => s.id === p.skillId);
    return skill ? { skillName: skill.name } : { skillMissing: true };
  }
  const prompt = typeof p.prompt === 'string' ? p.prompt : '';
  return { promptPreview: prompt.split('\n')[0].slice(0, 80) };
}

/** content_list in-memory filter (platform/status optional, exact match on non-empty values). */
export function filterContents(list: ContentItem[], f: { platform?: unknown; status?: unknown }): ContentItem[] {
  return list.filter((c) =>
    (typeof f.platform !== 'string' || f.platform.length === 0 || c.platform === f.platform)
    && (typeof f.status !== 'string' || f.status.length === 0 || c.status === (f.status as ContentItem['status'])));
}

/** Single validation point for tests/bridge: z.object(def.shape).safeParse. */
export function parseAppToolInput(name: string, raw: unknown) {
  const def = APP_TOOL_DEFS.find((d) => d.name === name);
  if (!def) throw new Error(`unknown app tool: ${name}`);
  return z.object(def.shape).safeParse(raw);
}
