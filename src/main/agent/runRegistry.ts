export type ActiveRun = {
  /** Graceful interrupt (SDK control request); synchronous wrapper, caller swallows errors. */
  interrupt: () => void;
  /** Hard termination (AbortController.abort()). */
  abort: () => void;
};

/**
 * Registry of active agent runs. No Electron dependency — stop semantics are
 * unit-testable in vitest (arch spec §2.3, AC3).
 */
export class RunRegistry {
  private runs = new Map<string, ActiveRun>();

  register(runId: string, run: ActiveRun): void {
    this.runs.set(runId, run);
  }

  unregister(runId: string): void {
    this.runs.delete(runId);
  }

  /** Two-phase stop (interrupt then abort). Unknown runId, or one already unregistered, returns false. */
  stop(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    try { run.interrupt(); } catch { /* already closed */ }
    run.abort();
    return true;
  }

  has(runId: string): boolean {
    return this.runs.has(runId);
  }
}
