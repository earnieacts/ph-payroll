import { formatFixed, parseDecimal, type Scaled } from '../decimal/index.js';
import { philHealth } from '../rules/philhealth.js';
import { pagIbig } from '../rules/pagibig.js';
import { monthlyWithholding } from '../rules/bir.js';
import { sss } from '../rules/sss.js';
import { assertPeriod, type ContributionResult, type Period } from '../rules/types.js';

/**
 * A full monthly statutory computation.
 *
 * Order is load-bearing (SPEC.md §3): employee-side statutory contributions
 * reduce taxable income, so they are computed before withholding tax. Only the
 * EMPLOYEE share does so; the employer share is a cost to the employer and never
 * touches the employee's tax base.
 */
export interface PayrollInput {
  /** Basic monthly pay, as a plain decimal string. Never a number. */
  monthlyBasic: string;
  /** The period being PAID, 'YYYY-MM'. Not today's date. */
  period: Period;
  /** Other non-taxable items (de minimis, etc.), as a decimal string. */
  otherNonTaxable?: string;
  /**
   * Include SSS. Defaults false, because SSS is not yet sourced and would throw.
   * Set true once the circular has been transcribed.
   */
  includeSss?: boolean;
}

export interface PayrollResult {
  period: Period;
  monthlyBasic: string;
  contributions: {
    sss?: { employee: string; employer: string; base: string; source: string };
    philHealth: { employee: string; employer: string; base: string; source: string };
    pagIbig: { employee: string; employer: string; base: string; source: string };
  };
  employeeDeductions: string;
  employerCost: string;
  taxableIncome: string;
  withholdingTax: string;
  netPay: string;
  /** Anything a payroll officer must know before trusting this figure. */
  warnings: string[];
}

const PESO_DP = 2;
const peso = (v: Scaled): string => formatFixed(v, PESO_DP);

function render(c: ContributionResult): { employee: string; employer: string; base: string; source: string } {
  return { employee: peso(c.employee), employer: peso(c.employer), base: peso(c.base), source: c.source };
}

export function computePayroll(input: PayrollInput): PayrollResult {
  assertPeriod(input.period);
  const basic = parseDecimal(input.monthlyBasic);
  if (basic < 0n) throw new RangeError('monthlyBasic must not be negative');
  const otherNonTaxable = input.otherNonTaxable ? parseDecimal(input.otherNonTaxable) : 0n;

  const warnings: string[] = [];

  const ph = philHealth(basic, input.period);
  const pi = pagIbig(basic, input.period);

  let sssResult: ContributionResult | null = null;
  if (input.includeSss) {
    sssResult = sss(basic, input.period); // throws NotSourcedError by design
  } else {
    warnings.push(
      'SSS is EXCLUDED from this computation. It is not yet sourced from Circular 2024-006, ' +
        'so these figures are incomplete and must not be used on a payslip as-is. See SPEC.md section 7.',
    );
  }

  const sssEmployee = sssResult?.employee ?? 0n;
  const sssEmployer = sssResult?.employer ?? 0n;

  const employeeDeductions = sssEmployee + ph.employee + pi.employee;
  const employerCost = sssEmployer + ph.employer + pi.employer;

  const taxable = basic - employeeDeductions - otherNonTaxable;
  const taxableIncome = taxable > 0n ? taxable : 0n;

  const withholdingTax = monthlyWithholding(taxableIncome, input.period);
  const netPay = basic - employeeDeductions - withholdingTax;

  return {
    period: input.period,
    monthlyBasic: peso(basic),
    contributions: {
      ...(sssResult ? { sss: render(sssResult) } : {}),
      philHealth: render(ph),
      pagIbig: render(pi),
    },
    employeeDeductions: peso(employeeDeductions),
    employerCost: peso(employerCost),
    taxableIncome: peso(taxableIncome),
    withholdingTax: peso(withholdingTax),
    netPay: peso(netPay),
    warnings,
  };
}
