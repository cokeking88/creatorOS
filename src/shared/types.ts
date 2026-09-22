
export type PlatformRecord = { id: string; workspaceId: string; name: string; key: string; createdAt: number; updatedAt: number };

export type AccountRecord = { id: string; platformId: string; name: string; handle?: string | null; browserProfileId?: string | null; createdAt: number; updatedAt: number };

export type BrowserProfile = {
  id: string;
  name: string;
  partition: string;
  platform?: string | null;
  accountId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type BrowserTab = {
  id: string;
  profileId: string;
  title: string;
  url: string;
  active: boolean;
  loading: boolean;
};

export type ContentItem = {
  id: string;
  title: string;
  body: string;
  platform: string;
  accountId?: string | null;
  status: 'idea' | 'draft' | 'scheduled' | 'published' | 'archived';
  scheduledAt?: number | null;
  publishedUrl?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type JobRecord = {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  workflowType: string;
  payload: Record<string, unknown>;
  lastRunAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type BrowserSnapshot = {
  url: string;
  title: string;
  text: string;
  elements: Array<{
    ref: string;
    tag: string;
    role: string | null;
    name: string;
    type: string | null;
    placeholder: string | null;
    href: string | null;
    disabled: boolean;
  }>;
};

/** One streamed execution step of a Claude Code agent run (chat and cron share this). */
export type AgentStep = {
  runId: string;
  seq: number;
  time: number;
  type: 'text' | 'tool_start' | 'tool_result' | 'done' | 'error';
  /** assistant text (or delta when isDelta) */
  text?: string;
  isDelta?: boolean;
  /** tool name for tool_start / tool_result */
  tool?: string;
  /** serialized tool input (tool_start) */
  inputText?: string;
  /** tool result summary or done/error metadata (JSON string) */
  detail?: string;
  ok?: boolean;
  /** 'chat' | 'cron:<jobName>' — enriched by the service, not the translator */
  source?: string;
  /** source assistant message uuid (delta grouping key) */
  msgUuid?: string;
  /** tool_result paired duration (tool_start -> tool_result, translator-computed) */
  durationMs?: number;
};

/** Claude Code SDK engine configuration (Settings page). */
export type AgentEngineConfig = {
  /** Anthropic-protocol gateway, e.g. company relay. Default: https://api.anthropic.com */
  baseUrl?: string;
  /** sent as ANTHROPIC_AUTH_TOKEN (Authorization: Bearer) */
  authToken?: string;
  /** sent as ANTHROPIC_API_KEY (x-api-key); authToken wins when both set */
  apiKey?: string;
  /** ANTHROPIC_MODEL */
  model?: string;
};

export type AgentRunResult = {
  runId: string;
  sessionId: string | null;
  ok: boolean;
  text: string;
  stepCount: number;
  costUsd?: number | null;
  durationMs?: number | null;
  /** failure/interrupt reason (same source as agent_runs.error) */
  error?: string | null;
  /** true when the user pressed stop (UI shows「已中断」rather than a generic error) */
  interrupted?: boolean;
  /** 'chat' | 'cron:<jobName>' */
  source?: string;
};

/** Dashboard「最近 Agent 运行」行（agent_runs 只读投影, §7.2）。 */
export type AgentRunSummary = {
  id: string;
  status: string;
  /** 'chat' | 'cron:<jobName>';损坏 input_json 降级为 'chat' */
  source: string;
  prompt: string;
  ok: boolean;
  costUsd: number | null;
  durationMs: number | null;
  startedAt: number;
  finishedAt: number | null;
};

/** Dashboard「最近定时任务运行」行（job_runs LEFT JOIN jobs 只读投影, §7.2）。 */
export type JobRunSummary = {
  id: string;
  jobId: string;
  /** job 已删除时为 '(已删除)' */
  jobName: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
};

/** agent:runs.list IPC 返回形状（Dashboard 挂载自取, 切页重挂载天然刷新）。 */
export type AgentRunsOverview = { agentRuns: AgentRunSummary[]; jobRuns: JobRunSummary[] };

export type AppState = {
  platforms: PlatformRecord[];
  accounts: AccountRecord[];
  profiles: BrowserProfile[];
  tabs: BrowserTab[];
  contents: ContentItem[];
  jobs: JobRecord[];
  activeProfileId: string | null;
  activeTabId: string | null;
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEntry = {
  seq: number;
  time: number;
  level: LogLevel;
  module: string;
  message: string;
  meta?: unknown;
};

export type LogFilter = {
  level?: LogLevel;
  module?: string;
  search?: string;
  since?: number;
  limit?: number;
};
