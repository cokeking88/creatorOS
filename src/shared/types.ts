
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

export type AgentMessage = { role: 'user' | 'assistant' | 'system'; content: string };

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

export type ProviderConfig = {
  provider: 'mock' | 'anthropic' | 'openai-compatible';
  anthropicKey?: string;
  anthropicModel?: string;
  compatBaseUrl?: string;
  compatKey?: string;
  compatModel?: string;
};

export type ProviderTestResult = {
  ok: boolean;
  provider: string;
  detail?: string;
};
