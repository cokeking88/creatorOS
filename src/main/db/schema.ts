import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
};

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(), name: text('name').notNull(), ...timestamps
});

export const platforms = sqliteTable('platforms', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull(), name: text('name').notNull(), key: text('key').notNull(), ...timestamps
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(), platformId: text('platform_id').notNull(), name: text('name').notNull(), handle: text('handle'), browserProfileId: text('browser_profile_id'), ...timestamps
});

export const browserProfiles = sqliteTable('browser_profiles', {
  id: text('id').primaryKey(), name: text('name').notNull(), partition: text('partition').notNull().unique(), platform: text('platform'), accountId: text('account_id'), ...timestamps
});

export const contents = sqliteTable('contents', {
  id: text('id').primaryKey(), platform: text('platform').notNull(), accountId: text('account_id'), title: text('title').notNull(), body: text('body').notNull().default(''), status: text('status').notNull().default('draft'), scheduledAt: integer('scheduled_at'), publishedUrl: text('published_url'), ...timestamps
});

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(), contentId: text('content_id'), kind: text('kind').notNull(), path: text('path').notNull(), mimeType: text('mime_type'), ...timestamps
});

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(), name: text('name').notNull(), type: text('type').notNull(), definitionJson: text('definition_json').notNull().default('{}'), ...timestamps
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), name: text('name').notNull(), cron: text('cron').notNull(), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true), workflowType: text('workflow_type').notNull(), payloadJson: text('payload_json').notNull().default('{}'), lastRunAt: integer('last_run_at'), ...timestamps
});

export const jobRuns = sqliteTable('job_runs', {
  id: text('id').primaryKey(), jobId: text('job_id').notNull(), status: text('status').notNull(), startedAt: integer('started_at').notNull(), finishedAt: integer('finished_at'), error: text('error'), outputJson: text('output_json')
});

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), status: text('status').notNull(), inputJson: text('input_json').notNull(), outputJson: text('output_json'), startedAt: integer('started_at').notNull(), finishedAt: integer('finished_at'), error: text('error'),
  sessionId: text('session_id'), stepsJson: text('steps_json'), costUsd: real('cost_usd'), durationMs: integer('duration_ms')
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(), value: text('value').notNull(), updatedAt: integer('updated_at').notNull()
});
