import { SSS_RULES } from './sss.js';
import { PHILHEALTH_RULES } from './philhealth.js';
import { PAGIBIG_RULES } from './pagibig.js';
import { BIR_RULES } from './bir.js';
import { appliesTo, assertPeriod, type Effective, type Period } from './types.js';

/**
 * What periods this library can actually compute.
 *
 * Encoded rules run from each circular's effective date, and the circulars did
 * not all take effect together. So `computePayroll`, which needs all four, has a
 * later floor than any individual rule: it is limited by the most recent one.
 *
 * Exposed programmatically rather than left to the README because a payroll
 * system should be able to check up front, once, instead of catching
 * `NoRuleError` per employee and per month.
 */

export type ContributionName = 'sss' | 'philHealth' | 'pagIbig' | 'bir';

export interface CoverageWindow {
  contribution: ContributionName;
  /** Inclusive, 'YYYY-MM'. */
  from: Period;
  /** Inclusive, or null when still in force. */
  to: Period | null;
  source: string;
}

export interface Coverage {
  windows: CoverageWindow[];
  /**
   * Earliest period `computePayroll` supports, being the latest start date among
   * all four contributions. An earlier period throws `NoRuleError`.
   */
  fullySupportedFrom: Period;
}

const SETS: ReadonlyArray<readonly [ContributionName, readonly Effective[]]> = [
  ['sss', SSS_RULES],
  ['philHealth', PHILHEALTH_RULES],
  ['pagIbig', PAGIBIG_RULES],
  ['bir', BIR_RULES],
];

export function coverage(): Coverage {
  const windows: CoverageWindow[] = [];
  for (const [contribution, rules] of SETS) {
    for (const r of rules) {
      windows.push({
        contribution,
        from: r.effectiveFrom,
        to: r.effectiveTo ?? null,
        source: r.source,
      });
    }
  }

  // The binding constraint is whichever contribution starts latest.
  const earliestPerContribution = SETS.map(([, rules]) =>
    rules.map((r) => r.effectiveFrom).sort()[0]!,
  );
  const fullySupportedFrom = earliestPerContribution.sort().at(-1)!;

  return { windows, fullySupportedFrom };
}

/**
 * Whether `computePayroll` can compute this period.
 *
 * Cheaper and clearer than a try/catch, and it lets a caller reject a payroll
 * run up front rather than failing partway through a batch.
 */
export function isPeriodSupported(period: string): boolean {
  assertPeriod(period);
  return SETS.every(([, rules]) => rules.some((r) => appliesTo(r, period)));
}
