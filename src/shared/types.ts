
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
