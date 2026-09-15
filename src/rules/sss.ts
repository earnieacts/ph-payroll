import { parseDecimal, mul, type Scaled } from '../decimal/index.js';
import { resolve, type Effective, type Period } from './types.js';

/**
 * SSS contribution.
 *
 * Source: SSS Circular No. 2024-006, "Schedule of SSS Contributions Effective
 * January 2025", signed 19 December 2024, issued under RA 11199 (Social Security
 * Act of 2018) and SSC Resolution No. 560-s.2024. Repeals Circular 2022-033.
 *
 * Three programs share one schedule:
 *   Regular SS  contributions on MSC up to 20,000
 *   MPF         Mandatory Provident Fund, on MSC in excess of 20,000 up to 35,000,
 *               credited to the member's individual account
 *   EC          Employees' Compensation, employer-only flat amount
 *
 * The published table has 61 rows, but it is fully derivable: the bracket is a
 * 500-peso step with boundaries at X,250, and every contribution is a flat
 * percentage of the relevant MSC slice. This module derives, and
 * `sss.table.test.ts` asserts the derivation reproduces all 61 published rows
 * exactly. A transcription slip and a formula slip cannot both hide.
 */
export interface SssRule extends Effective {
  /** Employer share of Regular SS and of MPF. */
  employerRate: Scaled;
  /** Employee share of Regular SS and of MPF. */
  employeeRate: Scaled;
  mscFloor: Scaled;
  mscCeiling: Scaled;
  mscStep: Scaled;
  /** MSC at or above which the Regular SS slice stops growing; the rest is MPF. */
  regularSsCeiling: Scaled;
  /** Employees' Compensation, employer-only. */
  ecLow: Scaled;
  ecHigh: Scaled;
  /** MSC at or above which EC steps from ecLow to ecHigh. */
  ecThreshold: Scaled;
}

export const SSS_RULES: readonly SssRule[] = [
  {
    effectiveFrom: '2025-01',
    employerRate: parseDecimal('0.10'),
    employeeRate: parseDecimal('0.05'),
    mscFloor: parseDecimal('5000'),
    mscCeiling: parseDecimal('35000'),
    mscStep: parseDecimal('500'),
    regularSsCeiling: parseDecimal('20000'),
    ecLow: parseDecimal('10'),
    ecHigh: parseDecimal('30'),
    ecThreshold: parseDecimal('15000'),
    source: 'SSS Circular No. 2024-006, effective January 2025 (RA 11199, SSC Res. 560-s.2024)',
  },
];

export interface SssResult {
  /** Total Monthly Salary Credit. */
  msc: Scaled;
  /** The slice of MSC that funds Regular SS (capped at 20,000). */
  regularSsMsc: Scaled;
  /** The slice above 20,000 that funds MPF. */
  mpfMsc: Scaled;
  employee: Scaled;
  employer: Scaled;
  /** Breakdown, because payroll systems must report the programs separately. */
  detail: {
    employeeRegularSs: Scaled;
    employeeMpf: Scaled;
    employerRegularSs: Scaled;
    employerMpf: Scaled;
    /** Employer-only. Not part of the employee's deduction. */
    ec: Scaled;
  };
  source: string;
}

/**
 * Map compensation to its Monthly Salary Credit.
 *
 * The published brackets run "X,250 to X,749.99 -> MSC X,500", with "BELOW 5,250"
 * at the floor and "34,750 and Over" at the ceiling. That is a 500-step rounding
 * whose boundary sits 250 above each step, so adding 250 before flooring puts the
 * boundary in the right place.
 *
 * Exposed because the MSC itself appears on payslips and in SSS filings, not just
 * the contribution derived from it.
 */
export function monthlySalaryCredit(compensation: Scaled, period: Period): Scaled {
  const rule = resolve(SSS_RULES, period, 'SSS');
  if (compensation <= rule.mscFloor) return rule.mscFloor;

  const half = rule.mscStep / 2n;
  const steps = (compensation + half) / rule.mscStep; // bigint division truncates
  const msc = steps * rule.mscStep;

  if (msc < rule.mscFloor) return rule.mscFloor;
  if (msc > rule.mscCeiling) return rule.mscCeiling;
  return msc;
}

export function sss(compensation: Scaled, period: Period): SssResult {
  const rule = resolve(SSS_RULES, period, 'SSS');
  const msc = monthlySalaryCredit(compensation, period);

  const regularSsMsc = msc > rule.regularSsCeiling ? rule.regularSsCeiling : msc;
  const mpfMsc = msc > rule.regularSsCeiling ? msc - rule.regularSsCeiling : 0n;

  const employeeRegularSs = mul(regularSsMsc, rule.employeeRate);
  const employeeMpf = mul(mpfMsc, rule.employeeRate);
  const employerRegularSs = mul(regularSsMsc, rule.employerRate);
  const employerMpf = mul(mpfMsc, rule.employerRate);
  const ec = msc >= rule.ecThreshold ? rule.ecHigh : rule.ecLow;

  return {
    msc,
    regularSsMsc,
    mpfMsc,
    // EC is employer-only and never reduces the employee's taxable income.
    employee: employeeRegularSs + employeeMpf,
    employer: employerRegularSs + employerMpf + ec,
    detail: { employeeRegularSs, employeeMpf, employerRegularSs, employerMpf, ec },
    source: rule.source,
  };
}
