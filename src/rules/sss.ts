import { parseDecimal, type Scaled } from '../decimal/index.js';
import { NotSourcedError, type ContributionResult, type Effective, type Period } from './types.js';

/**
 * SSS contribution.
 *
 * DELIBERATELY NOT IMPLEMENTED. See SPEC.md §7.
 *
 * The headline figures are known and agree across sources: Circular 2024-006,
 * effective January 2025, 15% of MSC split 10% employer / 5% employee, MSC from
 * 5,000 to 35,000 in 500 steps, EC of 10 rising to 30.
 *
 * Three things are NOT known well enough to encode:
 *
 *   1. The exact compensation-range boundaries that map to each MSC. The pattern
 *      is roughly "X,250 to X,749.99 -> MSC X,500", but the rounding at each
 *      boundary is precisely where an implementation silently disagrees with SSS
 *      by one bracket.
 *   2. The exact MSC at which EC steps from 10 to 30.
 *   3. The WISP split above MSC 20,000.
 *
 * A wrong bracket is worse than a missing one. A caller can handle
 * NotSourcedError; silently wrong statutory deductions surface months later as a
 * DOLE or BIR finding, by which time they have been wrong on every payslip.
 *
 * To finish this: read SSS Circular No. 2024-006 itself, transcribe the table,
 * and test every boundary on both sides.
 */
export interface SssRule extends Effective {
  totalRate: Scaled;
  employeeRate: Scaled;
  employerRate: Scaled;
  mscFloor: Scaled;
  mscCeiling: Scaled;
  mscIncrement: Scaled;
}

/** Known headline parameters. Not sufficient to compute a contribution. */
export const SSS_PARAMETERS: readonly SssRule[] = [
  {
    effectiveFrom: '2025-01',
    totalRate: parseDecimal('0.15'),
    employeeRate: parseDecimal('0.05'),
    employerRate: parseDecimal('0.10'),
    mscFloor: parseDecimal('5000'),
    mscCeiling: parseDecimal('35000'),
    mscIncrement: parseDecimal('500'),
    source: 'SSS Circular No. 2024-006, effective January 2025 (RA 11199)',
  },
];

/**
 * Declared as returning a ContributionResult even though it currently only
 * throws. That is the contract this function will honour once the circular is
 * transcribed, and pinning it now means sourcing the data changes the body
 * without churning every caller's types.
 */
export function sss(_monthlyBasic: Scaled, _period: Period): ContributionResult {
  throw new NotSourcedError(
    'SSS contribution',
    'the MSC bracket boundaries, the EC cut-over and the WISP split must be read from ' +
      'SSS Circular No. 2024-006 itself. Encoding them from secondary sources risks being ' +
      'wrong by one bracket on every payslip. See SPEC.md section 7.',
  );
}
