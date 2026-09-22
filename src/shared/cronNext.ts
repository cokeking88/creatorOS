/**
 * Cron next-run preview (UI redesign spec §3.6/§7.7).
 *
 * Semantics deliberately mirror node-cron 4.x (the production scheduler) as
 * verified against its dist source: dom AND dow (not Vixie OR), dow 7 = Sunday,
 * `?` only meaningful in the dom/dow fields, wrap-around ranges (`55-5`).
 * Forms node-cron accepts but we do not (@nicknames, L/W/# tokens, day/month
 * names, 6-field seconds) return null from parseCron so the UI shows
 * 「无法预览该表达式」rather than a possibly-wrong answer (§7.8.5).
 */

export type CronFields = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
};

// [min, maxInclusive] per field; dow allows 0..7 pre-normalization (7 -> Sunday).
const BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7],  // day of week
];

/** Expand one comma-separated field into the final value set, or null when malformed. */
function parseField(text: string, index: number): Set<number> | null {
  const [min, max] = BOUNDS[index];
  const out = new Set<number>();
  for (const part of text.split(',')) {
    if (part === '') return null;
    // `?` acts as `*` (node-cron converts it only in the dom/dow fields — mirror that).
    const body = part === '?' && (index === 2 || index === 4) ? '*' : part;
    const m = /^(\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/.exec(body);
    if (!m) return null; // names, L/W/#, `5/10`, stray chars, …
    const step = m[4] !== undefined ? Number(m[4]) : 1;
    if (!(step >= 1)) return null;
    // node-cron validate() rejects `N/step` (step without a range); mirror that.
    if (m[4] !== undefined && m[1] === '*') {
      // `*/n` is the legal wildcard-step form.
    } else if (m[4] !== undefined && m[3] === undefined) {
      return null;
    }
    let first = min;
    let last = max;
    if (m[1] !== '*') {
      first = Number(m[2]);
      last = m[3] !== undefined ? Number(m[3]) : first;
      if (first < min || first > max || last < min || last > max) return null;
    }
    if (first <= last) {
      for (let v = first; v <= last; v += step) out.add(v);
    } else {
      // Wrap-around range (node-cron expandRange): 55-5 -> 55..59,0..5.
      const size = max - min + 1;
      const span = (((last - first) % size) + size) % size;
      for (let off = 0; off <= span; off += step) {
        let v = first + off;
        if (v > max) v -= size;
        out.add(v);
      }
    }
  }
  return out;
}

/** Parse a standard 5-field cron expression. null = unsupported/malformed (never a guess). */
export function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null; // 4/6/7 fields, @nicknames, garbage
  const sets: Array<Set<number>> = [];
  for (let i = 0; i < 5; i++) {
    const s = parseField(parts[i], i);
    if (!s || s.size === 0) return null;
    sets.push(s);
  }
  const daysOfWeek = new Set<number>();
  for (const d of sets[4]) daysOfWeek.add(d === 7 ? 0 : d); // 7 = Sunday
  return { minutes: sets[0], hours: sets[1], daysOfMonth: sets[2], months: sets[3], daysOfWeek };
}

/**
 * Next fire time strictly after `from`, local timezone, minute granularity.
 * Brute-force forward enumeration capped at 366 days (~527k cheap iterations);
 * null = no match inside the window (e.g. Feb 30, or 29 Feb outside a leap year).
 */
export function nextCronDate(fields: CronFields, from: Date): Date | null {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), from.getHours(), from.getMinutes() + 1, 0, 0).getTime();
  const maxSteps = 366 * 24 * 60;
  for (let i = 0, t = start; i < maxSteps; i++, t += 60_000) {
    const d = new Date(t);
    if (fields.minutes.has(d.getMinutes())
      && fields.hours.has(d.getHours())
      && fields.daysOfMonth.has(d.getDate())
      && fields.months.has(d.getMonth() + 1)
      && fields.daysOfWeek.has(d.getDay())) return d;
  }
  return null;
}

// --- D6 shared gate (agent-capabilities §13.6): the strict parseCron subset is
// the single cron vocabulary — "runs but cannot be previewed in the UI" is
// rejected at every job-creation entry point (Scheduler.createJob is the
// authoritative gate; tool/Gateway layers pre-check for friendly errors).

/** D6 共享口径：建任务必须与 UI 预览互认，「能跑但预览不了」被拒。 */
export function isSupportedCron(expr: string): boolean { return parseCron(expr) !== null; }

export const CRON_ERROR_HINT = 'cron 表达式必须是标准 5 段形式（分 时 日 月 周，如 0 9 * * *）；不支持 @nickname、L/W/#、星期/月名与 6 段秒。';

/** job_list 的 nextRunAt（null = 无法解析或 366 天内不触发）。 */
export function nextRunAt(expr: string): number | null { const f = parseCron(expr); if (!f) return null; const d = nextCronDate(f, new Date()); return d ? d.getTime() : null; }
