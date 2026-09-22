import { describe, expect, it } from 'vitest';
import { parseCron, nextCronDate, isSupportedCron, nextRunAt, CRON_ERROR_HINT } from '../src/shared/cronNext.js';

/** Parse an expression and find its next fire time after `from` in one step. */
function next(expr: string, from: Date): Date | null {
  const f = parseCron(expr);
  if (!f) return null;
  return nextCronDate(f, from);
}

function d(y: number, m: number, day: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, day, h, min, 0, 0); // local timezone, matching node-cron default
}

describe('cronNext — basic forms (§7.7 ①)', () => {
  it('daily at 09:00 fires later today before 09:00, tomorrow after', () => {
    const before = next('0 9 * * *', d(2026, 6, 15, 8, 0));
    expect(before?.getFullYear()).toBe(2026);
    expect(before?.getMonth()).toBe(5); // June (0-based)
    expect(before?.getDate()).toBe(15);
    expect(before?.getHours()).toBe(9);
    const after = next('0 9 * * *', d(2026, 6, 15, 9, 0));
    expect(after?.getDate()).toBe(16);
    expect(after?.getHours()).toBe(9);
  });

  it('hourly fires on the next full hour; the from-minute itself is excluded', () => {
    const r = next('0 * * * *', d(2026, 6, 15, 10, 30));
    expect(r?.getHours()).toBe(11);
    expect(r?.getMinutes()).toBe(0);
  });

  it('step minutes */15 align to the grid strictly after from', () => {
    const r = next('*/15 * * * *', d(2026, 6, 15, 10, 31));
    expect(r?.getHours()).toBe(10);
    expect(r?.getMinutes()).toBe(45);
    const r2 = next('*/15 * * * *', d(2026, 6, 15, 10, 15));
    expect(r2?.getHours()).toBe(10); // 10:15 itself is excluded -> 10:30
    expect(r2?.getMinutes()).toBe(30);
  });

  it('hour range 9-17', () => {
    expect(next('0 9-17 * * *', d(2026, 6, 15, 3, 0))?.getHours()).toBe(9);
    expect(next('0 9-17 * * *', d(2026, 6, 15, 12, 30))?.getHours()).toBe(13);
    expect(next('0 9-17 * * *', d(2026, 6, 15, 18, 0))?.getDate()).toBe(16); // next day
    expect(next('0 9-17 * * *', d(2026, 6, 15, 18, 0))?.getHours()).toBe(9);
  });

  it('weekly: Monday 09:00 (dow 1)', () => {
    const r = next('0 9 * * 1', d(2026, 6, 15, 9, 30)); // 2026-06-15 is a Monday
    expect(r?.getDate()).toBe(22);
    expect(r?.getDay()).toBe(1);
  });

  it('dom list: 1st and 15th', () => {
    const r = next('0 9 1,15 * *', d(2026, 6, 15, 9, 0)); // on the 15th after the minute
    expect(r?.getDate()).toBe(1);
    expect(r?.getMonth()).toBe(6); // July (0-based)
  });
});

describe('cronNext — month-end (§7.7 ②)', () => {
  it('day 31 skips months with fewer days', () => {
    const r = next('0 23 31 * *', d(2026, 1, 1, 0, 0));
    expect(r?.getMonth()).toBe(0); // January 31
    expect(r?.getDate()).toBe(31);
  });
  it('day 31 after Jan 31 lands on Mar 31 (Feb has 28/29 days)', () => {
    const r = next('0 23 31 * *', d(2026, 2, 1, 0, 0));
    expect(r?.getMonth()).toBe(2); // March
    expect(r?.getDate()).toBe(31);
  });
});

describe('cronNext — leap year (§7.7 ③)', () => {
  it('0 9 29 2 * from 2028-01-01 -> 2028-02-29', () => {
    const r = next('0 9 29 2 *', d(2028, 1, 1, 0, 0));
    expect(r?.getFullYear()).toBe(2028);
    expect(r?.getMonth()).toBe(1);
    expect(r?.getDate()).toBe(29);
  });
});

describe('cronNext — no solution (§7.7 ④)', () => {
  it('29 Feb with no leap year inside the 366-day window returns null', () => {
    // From 2026-03-01 the next Feb 29 is 2028-02-29 — ~730 days out, beyond 366.
    expect(next('0 9 29 2 *', d(2026, 3, 1, 0, 0))).toBeNull();
  });
  it('Feb 30 never exists — always null', () => {
    expect(next('0 9 30 2 *', d(2026, 1, 1, 0, 0))).toBeNull();
  });
});

describe('cronNext — invalid / unsupported forms (§7.7 ⑤)', () => {
  it('rejects wrong field counts and garbage', () => {
    expect(parseCron('0 9 * *')).toBeNull();        // 4 fields
    expect(parseCron('0 9 * * 1 2')).toBeNull();    // 6 fields (with seconds)
    expect(parseCron('0 9 * * 1 2 3')).toBeNull();  // 7 fields
    expect(parseCron('not a cron')).toBeNull();     // garbage (3 fields after split)
    expect(parseCron('* * * * * *')).toBeNull();    // 6 fields
  });
  it('rejects out-of-range values', () => {
    expect(parseCron('60 * * * *')).toBeNull();   // minute
    expect(parseCron('* 24 * * *')).toBeNull();   // hour
    expect(parseCron('* * 32 * *')).toBeNull();   // dom
    expect(parseCron('* * * 13 *')).toBeNull();   // month
    expect(parseCron('* * * * 8')).toBeNull();    // dow
  });
  it('rejects @nicknames, L/#/W tokens and day/month names', () => {
    expect(parseCron('@daily')).toBeNull();
    expect(parseCron('@hourly')).toBeNull();
    expect(parseCron('0 9 L * *')).toBeNull();
    expect(parseCron('0 9 * * 1#2')).toBeNull();
    expect(parseCron('0 9 15W * *')).toBeNull();
    expect(parseCron('0 9 * * MON')).toBeNull();
    expect(parseCron('0 9 * JAN *')).toBeNull();
  });
  it('rejects node-cron-only step-without-range form 5/10', () => {
    expect(parseCron('5/10 * * * *')).toBeNull(); // node-cron validate() rejects this too
  });
});

describe('cronNext — node-cron semantic alignment (§7.7 ⑥)', () => {
  it('dow 7 means Sunday, same as 0', () => {
    const r7 = next('0 9 * * 7', d(2026, 6, 15, 9, 30)); // Mon Jun 15
    const r0 = next('0 9 * * 0', d(2026, 6, 15, 9, 30));
    expect(r7?.getTime()).toBe(r0?.getTime());
    expect(r7?.getDay()).toBe(0);
  });

  it('? acts as * in the dom/dow fields', () => {
    expect(next('0 9 ? * ?', d(2026, 6, 15, 8, 0))?.getDate()).toBe(15);
    expect(next('0 9 15 * ?', d(2026, 6, 14, 8, 0))?.getDate()).toBe(15);
    expect(next('0 9 ? * 1', d(2026, 6, 15, 9, 30))?.getDate()).toBe(22); // Monday
  });

  it('dom ∧ dow = AND when both are restricted (node-cron, not Vixie OR)', () => {
    // `0 9 1 * 1` fires only on a 1st that is a Monday.
    // 2026-06-01 is Monday the 1st; the next 1st-Monday is 2027-02-01 (calendar-verified).
    const r = next('0 9 1 * 1', d(2026, 6, 1, 9, 30));
    expect(r).not.toBeNull();
    expect(r?.getFullYear()).toBe(2027);
    expect(r?.getMonth()).toBe(1);
    expect(r?.getDate()).toBe(1);
    expect(r?.getDay()).toBe(1);
  });

  it('dom ∧ dow: a plain Sunday that is not the 15th must NOT match `0 9 15 * 0`', () => {
    // 2026-06-07 is a Sunday but not the 15th — under OR it would match; under AND it must not.
    // Next legit match is 2026-11-15 (15th, Sunday, calendar-verified).
    const f = parseCron('0 9 15 * 0');
    expect(f).not.toBeNull();
    if (f) {
      const r = nextCronDate(f, d(2026, 6, 6, 9, 0));
      expect(r?.getMonth()).toBe(10); // November
      expect(r?.getDate()).toBe(15);
      expect(r?.getDay()).toBe(0);
    }
  });

  it('dom unrestricted, dow restricted: plain dow semantics (no AND trap)', () => {
    // `0 9 * * 0` — every Sunday, not just Sundays that satisfy a dom list.
    const r = next('0 9 * * 0', d(2026, 6, 6, 9, 0)); // Sat Jun 6
    expect(r?.getDate()).toBe(7); // Sun Jun 7
  });

  it('wrap-around ranges expand like node-cron (55-5 minutes)', () => {
    const r = next('55-5 * * * *', d(2026, 6, 2, 0, 30)); // 00:30 -> next is 00:55
    expect(r?.getHours()).toBe(0);
    expect(r?.getMinutes()).toBe(55);
    const r2 = next('55-5 * * * *', d(2026, 6, 2, 0, 56)); // 00:56 -> next is 00:57 (still in range)
    expect(r2?.getHours()).toBe(0);
    expect(r2?.getMinutes()).toBe(57);
    const r3 = next('55-5 * * * *', d(2026, 6, 2, 0, 59)); // 00:59 -> wraps to 01:00
    expect(r3?.getHours()).toBe(1);
    expect(r3?.getMinutes()).toBe(0);
  });

  it('step inside a range (a-b/n): 9-17/2 minutes of every hour', () => {
    const r = next('9-17/2 * * * *', d(2026, 6, 2, 14, 10));
    expect(r?.getHours()).toBe(14);
    expect(r?.getMinutes()).toBe(11);
  });
});

describe('cronNext — D6 shared gate (agent-capabilities §13.6: isSupportedCron / nextRunAt)', () => {
  it('isSupportedCron accepts the standard 5-field subset and rejects everything the UI cannot preview', () => {
    for (const ok of ['0 9 * * *', '*/15 * * * *', '0 9-17 * * 1', '55-5 * * * *', '0 9 ? * ?']) expect(isSupportedCron(ok)).toBe(true);
    // the §13.6 hint enumerates exactly these rejected families
    for (const bad of ['@daily', '0 9 L * *', '0 9 * * 1#2', '0 9 * * MON', '0 9 15W * *', '* * * * * *', 'not a cron', '']) {
      expect(isSupportedCron(bad)).toBe(false);
    }
  });
  it('CRON_ERROR_HINT is the standard-5-field guidance shown by every rejection mouth', () => {
    expect(CRON_ERROR_HINT).toContain('标准 5 段');
    expect(CRON_ERROR_HINT).toContain('0 9 * * *');
    expect(CRON_ERROR_HINT).toContain('@nickname');
  });
  it('nextRunAt returns the epoch ms of the next fire strictly after now for a near-future expression', () => {
    const ts = nextRunAt('0 9 * * *');
    expect(typeof ts).toBe('number');
    const dt = new Date(ts!);
    expect(dt.getHours()).toBe(9);
    expect(dt.getMinutes()).toBe(0);
    expect(ts).toBeGreaterThan(Date.now() - 60_000); // strictly after now
  });
  it('nextRunAt is null for unparseable expressions and expressions with no hit inside 366 days', () => {
    expect(nextRunAt('not a cron')).toBeNull();
    expect(nextRunAt('* * * * * *')).toBeNull();
    // Time-robust: Feb 29 is either beyond the 366-day window (null) or a real
    // upcoming leap-day timestamp — never NaN, never a non-Feb-29 date.
    const feb29 = nextRunAt('0 9 29 2 *');
    if (feb29 !== null) { const dt = new Date(feb29); expect(dt.getMonth()).toBe(1); expect(dt.getDate()).toBe(29); expect(dt.getHours()).toBe(9); }
    expect(nextRunAt('0 9 30 2 *')).toBeNull(); // Feb 30 never exists
  });
});
