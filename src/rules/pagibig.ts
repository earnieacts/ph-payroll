import { parseDecimal, mul, type Scaled } from '../decimal/index.js';
import { resolve, type ContributionResult, type Effective, type Period } from './types.js';

/**
 * Pag-IBIG (HDMF) contribution.
 *
 * Basis: HDMF Circular No. 460, which raised the Maximum Fund Salary from
 * 5,000 to 10,000 effective February 2024.
 *
 * The familiar "200 maximum each" is NOT a separate rule. It falls out of
 * 2% x 10,000. Capping the base rather than the result keeps the two from
 * drifting apart if the MFS changes again.
 */
export interface PagIbigRule extends Effective {
  /** Compensation at or below this uses the lower employee rate. */
  lowerTierCeiling: Scaled;
  employeeRateLower: Scaled;
  employeeRateUpper: Scaled;
  employerRate: Scaled;
  /** Maximum Fund Salary: the cap on the base, not on the contribution. */
  maximumFundSalary: Scaled;
}

export const PAGIBIG_RULES: readonly PagIbigRule[] = [
  {
    effectiveFrom: '2024-02',
    lowerTierCeiling: parseDecimal('1500'),
    employeeRateLower: parseDecimal('0.01'),
    employeeRateUpper: parseDecimal('0.02'),
    employerRate: parseDecimal('0.02'),
    maximumFundSalary: parseDecimal('10000'),
    source: 'HDMF Circular No. 460, effective February 2024: MFS 10,000',
  },
];

export function pagIbig(monthlyBasic: Scaled, period: Period): ContributionResult {
  const rule = resolve(PAGIBIG_RULES, period, 'Pag-IBIG');

  const base = monthlyBasic > rule.maximumFundSalary ? rule.maximumFundSalary : monthlyBasic;

  // The tier is chosen on ACTUAL compensation but applied to the CAPPED base.
  // At exactly 1,500 the employee rate is 1%; at 1,500.01 it is 2%.
  const employeeRate =
    monthlyBasic <= rule.lowerTierCeiling ? rule.employeeRateLower : rule.employeeRateUpper;

  return {
    base,
    employee: mul(base, employeeRate),
    employer: mul(base, rule.employerRate),
    source: rule.source,
  };
}
