import type { Scaled } from '../decimal/index.js';

/**
 * A payroll period, 'YYYY-MM'.
 *
 * Computations are driven by the period being PAID, never by today's date. A run
 * for March 2024 must use the rules as they stood in March 2024; a back-computation
 * or a BIR audit needs history, and no third-party table publishes it.
 */
export type Period = string;

export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertPeriod(period: string): asserts period is Period {
  if (!PERIOD_RE.test(period)) {
    throw new RangeError(`period must be YYYY-MM, got ${JSON.stringify(period)}`);
  }
}

/** Every rule set carries the window it applies to and where it came from. */
export interface Effective {
  /** Inclusive, 'YYYY-MM'. */
  effectiveFrom: Period;
  /** Inclusive. Undefined means "still in force". */
  effectiveTo?: Period;
  /** The circular, statute or issuance this encodes. Not decoration: it is the audit trail. */
  source: string;
}

export function appliesTo(rule: Effective, period: Period): boolean {
  if (period < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== undefined && period > rule.effectiveTo) return false;
  return true;
}

/**
 * Select the rule set in force for a period.
 *
 * Overlapping windows are a DATA error, not something to resolve by picking the
 * first or the newest. Silently choosing would produce a plausible wrong answer,
 * which is the worst outcome in statutory computation.
 */
export function resolve<T extends Effective>(rules: readonly T[], period: Period, what: string): T {
  const matches = rules.filter((r) => appliesTo(r, period));
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new NoRuleError(
      `No ${what} rule set covers ${period}. Known windows: ` +
        rules.map((r) => `${r.effectiveFrom}..${r.effectiveTo ?? 'present'}`).join(', '),
    );
  }
  throw new RangeError(
    `${matches.length} ${what} rule sets overlap at ${period}. Fix the rule data; ` +
      `choosing one would be a plausible wrong answer.`,
  );
}

export class NoRuleError extends Error {
  readonly code = 'no_rule_for_period';
  constructor(message: string) {
    super(message);
    this.name = 'NoRuleError';
  }
}

/** Raised where a rule is known to exist but has not been sourced from its circular. */
export class NotSourcedError extends Error {
  readonly code = 'not_sourced';
  constructor(what: string, detail: string) {
    super(`${what} is not implemented: ${detail}`);
    this.name = 'NotSourcedError';
  }
}

/** One party's share of a contribution. */
export interface Share {
  employee: Scaled;
  employer: Scaled;
}

export interface ContributionResult extends Share {
  /** The figure the rate was actually applied to, after any floor, ceiling or cap. */
  base: Scaled;
  source: string;
}
