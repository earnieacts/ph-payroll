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
 * EMPLOYEE share does so. The employer share, and SSS's EC component in
 * particular, are costs to the employer and never touch the employee's tax base.
 */
export interface PayrollInput {
  /** Basic monthly pay, as a plain decimal string. Never a number. */
  monthlyBasic: string;
  /** The period being PAID, 'YYYY-MM'. Not today's date. */
  period: Period;
  /** Other non-taxable items (de minimis, etc.), as a decimal string. */
  otherNonTaxable?: string;
}

export interface Rendered {
  employee: string;
  employer: string;
  base: string;
  source: string;
}

export interface PayrollResult {
  period: Period;
  monthlyBasic: string;
  contributions: {
    sss: Rendered & {
      msc: string;
      regularSsMsc: string;
      mpfMsc: string;
      /** Employer-only Employees' Compensation premium. */
      ec: string;
    };
    philHealth: Rendered;
    pagIbig: Rendered;
  };
  employeeDeductions: string;
  employerCost: string;
  taxableIncome: string;
  withholdingTax: string;
  netPay: string;
}

const PESO_DP = 2;
const peso = (v: Scaled): string => formatFixed(v, PESO_DP);

function render(c: ContributionResult): Rendered {
  return { employee: peso(c.employee), employer: peso(c.employer), base: peso(c.base), source: c.source };
}

export function computePayroll(input: PayrollInput): PayrollResult {
  assertPeriod(input.period);
  const basic = parseDecimal(input.monthlyBasic);
  if (basic < 0n) throw new RangeError('monthlyBasic must not be negative');
  const otherNonTaxable = input.otherNonTaxable ? parseDecimal(input.otherNonTaxable) : 0n;

  const ss = sss(basic, input.period);
  const ph = philHealth(basic, input.period);
  const pi = pagIbig(basic, input.period);

  const employeeDeductions = ss.employee + ph.employee + pi.employee;
  const employerCost = ss.employer + ph.employer + pi.employer;

  const taxable = basic - employeeDeductions - otherNonTaxable;
  const taxableIncome = taxable > 0n ? taxable : 0n;

  const withholdingTax = monthlyWithholding(taxableIncome, input.period);
  const netPay = basic - employeeDeductions - withholdingTax;

  return {
    period: input.period,
    monthlyBasic: peso(basic),
    contributions: {
      sss: {
        employee: peso(ss.employee),
        employer: peso(ss.employer),
        // The MSC is what the rates were applied to, and it appears on SSS filings.
        base: peso(ss.msc),
        msc: peso(ss.msc),
        regularSsMsc: peso(ss.regularSsMsc),
        mpfMsc: peso(ss.mpfMsc),
        ec: peso(ss.detail.ec),
        source: ss.source,
      },
      philHealth: render(ph),
      pagIbig: render(pi),
    },
    employeeDeductions: peso(employeeDeductions),
    employerCost: peso(employerCost),
    taxableIncome: peso(taxableIncome),
    withholdingTax: peso(withholdingTax),
    netPay: peso(netPay),
  };
}
