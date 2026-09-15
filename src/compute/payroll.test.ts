import { describe, it, expect } from 'vitest';
import { computePayroll } from './payroll.js';
import { NotSourcedError, NoRuleError } from '../rules/types.js';

/**
 * Golden values were computed independently in Python's `decimal` at 40 digits,
 * NOT by running this implementation and pasting the output. Reproduce with:
 *
 *   python3 -c "from decimal import *; getcontext().prec=40; ..."
 *
 * A test that asserts the code agrees with itself proves only self-consistency.
 */
const run = (monthlyBasic: string, period = '2026-03') => computePayroll({ monthlyBasic, period });

describe('full monthly computation, 2026-03', () => {
  it('a minimum-wage-scale earner pays statutory contributions but no tax', () => {
    const r = run('9000');
    expect(r.contributions.philHealth.employee).toBe('250.00'); // floored at 10,000 base
    expect(r.contributions.pagIbig.employee).toBe('180.00');
    expect(r.taxableIncome).toBe('8570.00');
    expect(r.withholdingTax).toBe('0.00');
    expect(r.netPay).toBe('8570.00');
  });

  it('a mid earner', () => {
    const r = run('25000');
    expect(r.contributions.philHealth.employee).toBe('625.00');
    expect(r.contributions.pagIbig.employee).toBe('200.00'); // capped
    expect(r.taxableIncome).toBe('24175.00');
    expect(r.withholdingTax).toBe('501.25');
    expect(r.netPay).toBe('23673.75');
  });

  it('a higher earner', () => {
    const r = run('50000');
    expect(r.taxableIncome).toBe('48550.00');
    expect(r.withholdingTax).toBe('4918.33');
    expect(r.netPay).toBe('43631.67');
  });

  it('an earner above the PhilHealth ceiling', () => {
    const r = run('120000');
    expect(r.contributions.philHealth.employee).toBe('2500.00'); // ceiling
    expect(r.contributions.pagIbig.employee).toBe('200.00'); // cap
    expect(r.taxableIncome).toBe('117300.00');
    expect(r.withholdingTax).toBe('21200.00');
    expect(r.netPay).toBe('96100.00');
  });

  it('handles the Pag-IBIG tier boundary on both sides', () => {
    expect(run('1500').contributions.pagIbig.employee).toBe('15.00');
    expect(run('1500.01').contributions.pagIbig.employee).toBe('30.00');
    // Higher pay, lower take-home: the discontinuity is real, not a bug.
    expect(run('1500').netPay).toBe('1235.00');
    expect(run('1500.01').netPay).toBe('1220.01');
  });
});

describe('the arithmetic is internally consistent', () => {
  it('net = basic - employee deductions - tax, exactly', () => {
    for (const basic of ['9000', '25000', '50000', '120000', '37500.55']) {
      const r = run(basic);
      const expected =
        Number(r.monthlyBasic) - Number(r.employeeDeductions) - Number(r.withholdingTax);
      // Number() only here, to check the relation; the values themselves are strings.
      expect(Number(r.netPay)).toBeCloseTo(expected, 2);
    }
  });

  it('employee deductions equal the sum of the employee shares', () => {
    const r = run('25000');
    const sum = Number(r.contributions.philHealth.employee) + Number(r.contributions.pagIbig.employee);
    expect(Number(r.employeeDeductions)).toBeCloseTo(sum, 2);
  });

  it('employer cost is separate and never reduces taxable income', () => {
    const r = run('25000');
    expect(Number(r.employerCost)).toBeGreaterThan(0);
    // taxable = basic - EMPLOYEE deductions only
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
});

describe('honesty about what is missing', () => {
  it('warns loudly that SSS is excluded', () => {
    const r = run('25000');
    expect(r.warnings.join(' ')).toMatch(/SSS is EXCLUDED/);
    expect(r.warnings.join(' ')).toMatch(/must not be used on a payslip/);
    expect(r.contributions.sss).toBeUndefined();
  });

  it('throws rather than guessing when SSS is explicitly requested', () => {
    expect(() => computePayroll({ monthlyBasic: '25000', period: '2026-03', includeSss: true })).toThrow(
      NotSourcedError,
    );
  });

  it('refuses a period whose rules are not encoded', () => {
    // 2023 had different PhilHealth rates and a lower Pag-IBIG MFS. Back-applying
    // 2026 figures would be wrong on every line.
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
