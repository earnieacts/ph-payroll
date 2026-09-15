/**
 * ph-payroll: Philippine payroll statutory computation.
 *
 * Two levels of API.
 *
 * **String in, string out** is the one most callers want. Amounts are decimal
 * strings, never JS numbers, because `parseFloat('25000.55')` is a wrong
 * deduction on someone's payslip:
 *
 * ```ts
 * import { computePayroll } from 'ph-payroll';
 * const r = computePayroll({ monthlyBasic: '25000', period: '2026-03' });
 * r.netPay; // '22611.25'
 * ```
 *
 * **Individual rules** work in `Scaled` (a bigint at 10^18) for callers doing
 * their own arithmetic. Convert with `parseDecimal` and `formatFixed`.
 *
 * Every computation takes the period being PAID, not today's date, and throws
 * `NoRuleError` for a period whose rules are not encoded rather than silently
 * applying the current ones.
 */

export { computePayroll } from './compute/payroll.js';
export type { PayrollInput, PayrollResult, Rendered } from './compute/payroll.js';

export { sss, monthlySalaryCredit, SSS_RULES } from './rules/sss.js';
export type { SssResult, SssRule } from './rules/sss.js';

export { philHealth, PHILHEALTH_RULES } from './rules/philhealth.js';
export type { PhilHealthRule } from './rules/philhealth.js';

export { pagIbig, PAGIBIG_RULES } from './rules/pagibig.js';
export type { PagIbigRule } from './rules/pagibig.js';

export { annualTax, monthlyWithholding, thirteenthMonthTaxable, BIR_RULES } from './rules/bir.js';
export type { BirRule, TaxBracket } from './rules/bir.js';

export { NoRuleError, NotSourcedError, appliesTo, resolve, assertPeriod, PERIOD_RE } from './rules/types.js';
export type { Period, Effective, Share, ContributionResult } from './rules/types.js';

/**
 * Decimal helpers, for callers working with the `Scaled` rule functions directly.
 * `computePayroll` handles conversion itself and needs none of this.
 */
export {
  parseDecimal,
  formatFixed,
  formatSignificant,
  mul,
  div,
  roundTo,
  abs,
  relativeDiff,
  RATE_SCALE,
  SCALE_DP,
  DecimalParseError,
} from './decimal/index.js';
export type { Scaled } from './decimal/index.js';
