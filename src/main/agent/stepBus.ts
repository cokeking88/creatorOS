import type { AgentStep, AgentRunResult } from '../../shared/types.js';
import { logger } from '../services/logger.js';

/** In-process agent run events. Chat and cron share the same stream. */
export type AgentBusEvent =
  | { kind: 'step'; step: AgentStep }
  | { kind: 'done'; result: AgentRunResult };

export type StepBusHandler = (event: AgentBusEvent) => void;

export interface StepBus {
  /** Synchronously fan out to all current subscribers; a throwing subscriber is logged and swallowed, others still receive the event. */
  publish(event: AgentBusEvent): void;
  /** Subscribe; returns an unsubscribe function. */
  subscribe(handler: StepBusHandler): () => void;
  /** Current subscriber count (tests). */
  readonly size: number;
}

/**
 * Push-only, unbuffered fan-out. Events published while the renderer window is
 * gone are dropped — the audit trail lives in agent_runs and the logs, the
 * renderer is a transient view (arch spec §2.1).
 */
export function createStepBus(): StepBus {
  const handlers = new Set<StepBusHandler>();
  const log = logger.child('agent-bus');
  return {
    publish(event) {
      for (const h of handlers) {
        try { h(event); } catch (e) { log.warn('Step bus subscriber failed', { error: String(e) }); }
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => { handlers.delete(handler); };
    },
    get size() { return handlers.size; },
  };
}
