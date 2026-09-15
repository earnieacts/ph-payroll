import { describe, it, expect } from 'vitest';
import { computePayroll } from './payroll.js';
import { NoRuleError } from '../rules/types.js';

/**
 * Golden values computed independently in Python's `decimal` at 40 digits, NOT by
 * running this implementation and pasting the output. Reproduce with the script
 * in SPEC.md §9. A test that asserts the code agrees with itself proves only
 * self-consistency.
 */
const run = (monthlyBasic: string, period = '2026-03') => computePayroll({ monthlyBasic, period });

describe('full monthly computation, 2026-03', () => {
  it('a minimum-wage-scale earner: contributions but no tax', () => {
    const r = run('9000');
    expect(r.contributions.sss.msc).toBe('9000.00');
    expect(r.contributions.sss.employee).toBe('450.00');
    expect(r.contributions.sss.employer).toBe('910.00'); // includes EC 10
    expect(r.contributions.philHealth.employee).toBe('250.00'); // floored base
    expect(r.contributions.pagIbig.employee).toBe('180.00');
    expect(r.employeeDeductions).toBe('880.00');
    expect(r.taxableIncome).toBe('8120.00');
    expect(r.withholdingTax).toBe('0.00');
    expect(r.netPay).toBe('8120.00');
    expect(r.employerCost).toBe('1340.00');
  });

  it('a mid earner, into MPF territory', () => {
    const r = run('25000');
    expect(r.contributions.sss.msc).toBe('25000.00');
    expect(r.contributions.sss.regularSsMsc).toBe('20000.00');
    expect(r.contributions.sss.mpfMsc).toBe('5000.00');
    expect(r.contributions.sss.employee).toBe('1250.00');
    expect(r.contributions.sss.ec).toBe('30.00');
    expect(r.employeeDeductions).toBe('2075.00');
    expect(r.taxableIncome).toBe('22925.00');
    expect(r.withholdingTax).toBe('313.75');
    expect(r.netPay).toBe('22611.25');
    expect(r.employerCost).toBe('3355.00');
  });

  it('a higher earner, at the SSS ceiling', () => {
    const r = run('50000');
    expect(r.contributions.sss.msc).toBe('35000.00'); // capped
    expect(r.contributions.sss.employee).toBe('1750.00');
    expect(r.taxableIncome).toBe('46800.00');
    expect(r.withholdingTax).toBe('4568.33');
    expect(r.netPay).toBe('42231.67');
  });

  it('an earner above every ceiling', () => {
    const r = run('120000');
    expect(r.contributions.sss.msc).toBe('35000.00');
    expect(r.contributions.philHealth.employee).toBe('2500.00');
    expect(r.contributions.pagIbig.employee).toBe('200.00');
    expect(r.employeeDeductions).toBe('4450.00');
    expect(r.taxableIncome).toBe('115550.00');
    expect(r.withholdingTax).toBe('20762.50');
    expect(r.netPay).toBe('94787.50');
  });
});

describe('boundaries that bite', () => {
  it('handles the Pag-IBIG tier at exactly 1,500 and one centavo above', () => {
    expect(run('1500').contributions.pagIbig.employee).toBe('15.00');
    expect(run('1500.01').contributions.pagIbig.employee).toBe('30.00');
    // Higher pay, lower take-home. The discontinuity is in the circular, not a bug.
    expect(run('1500').netPay).toBe('985.00');
    expect(run('1500.01').netPay).toBe('970.01');
  });

  it('handles the SSS EC step at MSC 15,000', () => {
    const below = run('14749.99');
    const above = run('14750');
    expect(below.contributions.sss.msc).toBe('14500.00');
    expect(below.contributions.sss.ec).toBe('10.00');
    expect(above.contributions.sss.msc).toBe('15000.00');
    expect(above.contributions.sss.ec).toBe('30.00');
    // One centavo more pay costs the employer 70 pesos more.
    expect(below.employerCost).toBe('2028.75');
    expect(above.employerCost).toBe('2098.75');
  });
});

describe('the arithmetic is internally consistent', () => {
  it('net = basic - employee deductions - tax, exactly', () => {
    for (const basic of ['9000', '25000', '50000', '120000', '37500.55']) {
      const r = run(basic);
      expect(Number(r.netPay)).toBeCloseTo(
        Number(r.monthlyBasic) - Number(r.employeeDeductions) - Number(r.withholdingTax),
        2,
      );
    }
  });

  it('employee deductions are exactly the three employee shares', () => {
    const r = run('25000');
    const sum =
      Number(r.contributions.sss.employee) +
      Number(r.contributions.philHealth.employee) +
      Number(r.contributions.pagIbig.employee);
    expect(Number(r.employeeDeductions)).toBeCloseTo(sum, 2);
  });

  it('EC is employer-only and never reaches the employee', () => {
    const r = run('25000');
    // SSS employee is 5% of MSC with no EC component: 5% of 25,000 = 1,250.
    expect(r.contributions.sss.employee).toBe('1250.00');
    expect(Number(r.contributions.sss.employer)).toBeCloseTo(
      Number(r.contributions.sss.employee) * 2 + Number(r.contributions.sss.ec),
      2,
    );
  });

  it('employer cost never reduces taxable income', () => {
    const r = run('25000');
    expect(Number(r.taxableIncome)).toBeCloseTo(
      Number(r.monthlyBasic) - Number(r.employeeDeductions),
      2,
    );
  });

  it('emits every amount as a string', () => {
    const r = run('25000');
    for (const v of [r.monthlyBasic, r.taxableIncome, r.withholdingTax, r.netPay, r.employerCost]) {
      expect(typeof v).toBe('string');
    }
  });

  it('cites a source for every contribution', () => {
    const r = run('25000');
    expect(r.contributions.sss.source).toMatch(/2024-006/);
    expect(r.contributions.philHealth.source).toMatch(/11223/);
    expect(r.contributions.pagIbig.source).toMatch(/460/);
  });
});

describe('refuses rather than guesses', () => {
  it('rejects a period whose rules are not encoded', () => {
    expect(() => run('25000', '2023-06')).toThrow(NoRuleError);
  });

  it('rejects a malformed period', () => {
    expect(() => run('25000', '2026-13')).toThrow(RangeError);
  });

  it('rejects negative pay', () => {
    expect(() => run('-1000')).toThrow(RangeError);
  });

  it('rejects an amount that is not a plain decimal', () => {
    expect(() => run('25,000')).toThrow();
    expect(() => run('2.5e4')).toThrow();
  });
});
