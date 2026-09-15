import { parseDecimal, mul, div, type Scaled } from '../decimal/index.js';
import { resolve, type ContributionResult, type Effective, type Period } from './types.js';

/**
 * PhilHealth premium.
 *
 * Basis: RA 11223 (Universal Health Care Act), which stepped the premium rate up
 * annually. The 5% rate is the final scheduled adjustment.
 *
 * Only the 2026 rule set is encoded. Earlier years used lower rates and different
 * ceilings; those are a known gap (SPEC.md §8) and are deliberately absent rather
 * than approximated, so a 2023 computation fails loudly instead of quietly using
 * 2026 numbers.
 */
export interface PhilHealthRule extends Effective {
  rate: Scaled;
  floor: Scaled;
  ceiling: Scaled;
}

export const PHILHEALTH_RULES: readonly PhilHealthRule[] = [
  {
    effectiveFrom: '2026-01',
    rate: parseDecimal('0.05'),
    floor: parseDecimal('10000'),
    ceiling: parseDecimal('100000'),
    source: 'RA 11223 (UHC Act), CY2026 premium schedule: 5%, floor 10,000, ceiling 100,000',
  },
];

export function philHealth(monthlyBasic: Scaled, period: Period): ContributionResult {
  const rule = resolve(PHILHEALTH_RULES, period, 'PhilHealth');

  // Clamp to the statutory band. Below the floor the premium is the floor's;
  // above the ceiling it stops growing.
  const base = monthlyBasic < rule.floor ? rule.floor : monthlyBasic > rule.ceiling ? rule.ceiling : monthlyBasic;

  const premium = mul(base, rule.rate);
  const half = div(premium, parseDecimal('2'));

  return { base, employee: half, employer: half, source: rule.source };
}
