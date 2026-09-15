import { parseDecimal, mul, type Scaled } from '../decimal/index.js';
import { resolve, type Effective, type Period } from './types.js';

/**
 * BIR withholding tax on compensation.
 *
 * Basis: TRAIN (RA 10963) second-phase rates, effective 1 January 2023 and
 * unchanged since.
 *
 * The ANNUAL table is the single source of truth and the periodic figures are
 * derived from it. BIR also publishes monthly, semi-monthly, weekly and daily
 * tables, but transcribing four tables gives you four things that can disagree;
 * deriving from one gives you one thing that can be wrong in only one place.
 */
export interface TaxBracket {
  /** Exclusive lower bound of annual taxable income. */
  over: Scaled;
  /** Fixed tax on everything up to `over`. */
  baseTax: Scaled;
  /** Marginal rate on the excess over `over`. */
  rate: Scaled;
}

export interface BirRule extends Effective {
  brackets: readonly TaxBracket[];
  /** Annual exemption on 13th month pay and other benefits. */
  thirteenthMonthExemption: Scaled;
}

/** TRAIN second-phase annual table, effective 2023-01 onwards. */
export const BIR_RULES: readonly BirRule[] = [
  {
    effectiveFrom: '2023-01',
    thirteenthMonthExemption: parseDecimal('90000'),
    brackets: [
      { over: parseDecimal('0'), baseTax: parseDecimal('0'), rate: parseDecimal('0') },
      { over: parseDecimal('250000'), baseTax: parseDecimal('0'), rate: parseDecimal('0.15') },
      { over: parseDecimal('400000'), baseTax: parseDecimal('22500'), rate: parseDecimal('0.20') },
      { over: parseDecimal('800000'), baseTax: parseDecimal('102500'), rate: parseDecimal('0.25') },
      { over: parseDecimal('2000000'), baseTax: parseDecimal('402500'), rate: parseDecimal('0.30') },
      { over: parseDecimal('8000000'), baseTax: parseDecimal('2202500'), rate: parseDecimal('0.35') },
    ],
    source: 'TRAIN (RA 10963), second-phase rates effective 1 January 2023',
  },
];

/** Annual income tax on a taxable amount. */
export function annualTax(annualTaxable: Scaled, period: Period): Scaled {
  const rule = resolve(BIR_RULES, period, 'BIR');
  if (annualTaxable <= 0n) return 0n;

  // Brackets are ordered ascending; take the last whose lower bound is exceeded.
  // Boundaries are EXCLUSIVE: exactly 250,000 is still exempt.
  let chosen = rule.brackets[0]!;
  for (const b of rule.brackets) {
    if (annualTaxable > b.over) chosen = b;
    else break;
  }
  return chosen.baseTax + mul(annualTaxable - chosen.over, chosen.rate);
}

/**
 * Monthly withholding, derived by annualising.
 *
 * This is the projection method: assume the month's taxable pay repeats for
 * twelve months, tax that, divide by twelve. It is what the published monthly
 * table encodes. Year-end annualisation then trues it up against actual
 * cumulative pay, which is a separate calculation and not this function's job.
 */
export function monthlyWithholding(monthlyTaxable: Scaled, period: Period): Scaled {
  if (monthlyTaxable <= 0n) return 0n;
  const twelve = parseDecimal('12');
  const annual = mul(monthlyTaxable, twelve);
  const tax = annualTax(annual, period);
  return tax === 0n ? 0n : tax / 12n;
}

/** The exempt portion of 13th month pay and other benefits for the year. */
export function thirteenthMonthTaxable(totalBenefits: Scaled, period: Period): Scaled {
  const rule = resolve(BIR_RULES, period, 'BIR');
  const excess = totalBenefits - rule.thirteenthMonthExemption;
  return excess > 0n ? excess : 0n;
}
