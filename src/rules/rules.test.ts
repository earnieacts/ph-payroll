import { describe, it, expect } from 'vitest';
import { parseDecimal, formatFixed } from '../decimal/index.js';
import { philHealth } from './philhealth.js';
import { pagIbig } from './pagibig.js';
import { annualTax, thirteenthMonthTaxable } from './bir.js';
import { sss } from './sss.js';
import { resolve, appliesTo, assertPeriod, NoRuleError, NotSourcedError } from './types.js';

const peso = (v: bigint) => formatFixed(v, 2);
const P = (s: string) => parseDecimal(s);

describe('effective dating', () => {
  const rules = [
    { effectiveFrom: '2023-01', effectiveTo: '2023-12', source: 'a' },
    { effectiveFrom: '2024-01', source: 'b' },
  ];

  it('selects by the period being paid', () => {
    expect(resolve(rules, '2023-06', 'test').source).toBe('a');
    expect(resolve(rules, '2024-01', 'test').source).toBe('b');
    expect(resolve(rules, '2030-11', 'test').source).toBe('b');
  });

  it('includes both window boundaries', () => {
    expect(appliesTo(rules[0]!, '2023-01')).toBe(true);
    expect(appliesTo(rules[0]!, '2023-12')).toBe(true);
    expect(appliesTo(rules[0]!, '2022-12')).toBe(false);
    expect(appliesTo(rules[0]!, '2024-01')).toBe(false);
  });

  it('throws for a period no rule covers, rather than using the nearest', () => {
    expect(() => resolve(rules, '2022-06', 'test')).toThrow(NoRuleError);
  });

  it('throws when windows overlap, rather than picking one', () => {
    // A plausible wrong answer is the worst outcome in statutory computation.
    const bad = [
      { effectiveFrom: '2024-01', source: 'x' },
      { effectiveFrom: '2024-06', source: 'y' },
    ];
    expect(() => resolve(bad, '2024-07', 'test')).toThrow(/overlap/);
  });

  it('rejects a malformed period', () => {
    for (const p of ['2026', '2026-13', '2026-00', '26-01', '2026-1', '']) {
      expect(() => assertPeriod(p), p).toThrow(RangeError);
    }
    expect(() => assertPeriod('2026-01')).not.toThrow();
  });
});

describe('PhilHealth (RA 11223, CY2026: 5%, floor 10k, ceiling 100k)', () => {
  const at = (s: string) => philHealth(P(s), '2026-03');

  it('applies the floor below 10,000', () => {
    // 10,000 x 5% / 2 = 250 each, the statutory minimum.
    expect(peso(at('5000').employee)).toBe('250.00');
    expect(peso(at('9999.99').employee)).toBe('250.00');
    expect(peso(at('0').employee)).toBe('250.00');
  });

  it('is proportional between the bounds', () => {
    expect(peso(at('25000').employee)).toBe('625.00');
    expect(peso(at('50000').employee)).toBe('1250.00');
  });

  it('applies the ceiling above 100,000', () => {
    // 100,000 x 5% / 2 = 2,500 each; 5,000 total is the statutory maximum.
    expect(peso(at('100000').employee)).toBe('2500.00');
    expect(peso(at('120000').employee)).toBe('2500.00');
    expect(peso(at('1000000').employee)).toBe('2500.00');
  });

  it('splits exactly in half', () => {
    const r = at('33333.33');
    expect(r.employee).toBe(r.employer);
  });

  it('exposes the base the rate was applied to', () => {
    expect(peso(at('5000').base)).toBe('10000.00');
    expect(peso(at('120000').base)).toBe('100000.00');
  });

  it('refuses a period before the rule exists rather than back-applying 2026 rates', () => {
    // The UHC Act stepped the rate up annually; using 2026's rate for 2023
    // would over-deduct on every payslip.
    expect(() => philHealth(P('25000'), '2023-06')).toThrow(NoRuleError);
  });
});

describe('Pag-IBIG (HDMF Circular 460, MFS 10,000)', () => {
  const at = (s: string) => pagIbig(P(s), '2026-03');

  it('uses 1% employee at exactly 1,500 and 2% just above', () => {
    // The discontinuity is real and is a common off-by-one in payroll code.
    expect(peso(at('1500').employee)).toBe('15.00');
    expect(peso(at('1500.01').employee)).toBe('30.00');
  });

  it('always charges the employer 2%', () => {
    expect(peso(at('1500').employer)).toBe('30.00');
    expect(peso(at('1500.01').employer)).toBe('30.00');
  });

  it('caps the base at the Maximum Fund Salary', () => {
    expect(peso(at('10000').employee)).toBe('200.00');
    expect(peso(at('50000').employee)).toBe('200.00');
    expect(peso(at('50000').employer)).toBe('200.00');
    expect(peso(at('50000').base)).toBe('10000.00');
  });

  it('is proportional below the cap', () => {
    expect(peso(at('9000').employee)).toBe('180.00');
  });

  it('refuses a period before the circular took effect', () => {
    // Before Feb 2024 the MFS was 5,000, so the cap was 100, not 200.
    expect(() => pagIbig(P('25000'), '2024-01')).toThrow(NoRuleError);
  });
});

describe('BIR annual tax (TRAIN second phase)', () => {
  const at = (s: string) => peso(annualTax(P(s), '2026-03'));

  it('exempts up to and including 250,000', () => {
    expect(at('0')).toBe('0.00');
    expect(at('250000')).toBe('0.00');
  });

  it('taxes only the excess just above a boundary', () => {
    // 0.01 x 15% = 0.0015, which rounds to 0.00 at peso precision.
    expect(at('250000.01')).toBe('0.00');
  });

  it('matches every published bracket floor exactly', () => {
    expect(at('400000')).toBe('22500.00');
    expect(at('800000')).toBe('102500.00');
    expect(at('2000000')).toBe('402500.00');
    expect(at('8000000')).toBe('2202500.00');
  });

  it('applies the top marginal rate above 8,000,000', () => {
    // 2,202,500 + 35% of 1,000,000
    expect(at('9000000')).toBe('2552500.00');
  });

  it('is continuous across each boundary', () => {
    for (const b of ['400000', '800000', '2000000', '8000000']) {
      const below = annualTax(P(b) - P('0.01'), '2026-03');
      const at_ = annualTax(P(b), '2026-03');
      const above = annualTax(P(b) + P('0.01'), '2026-03');
      expect(below <= at_, `below ${b}`).toBe(true);
      expect(at_ <= above, `above ${b}`).toBe(true);
    }
  });

  it('treats negative taxable income as zero, not a refund', () => {
    expect(at('-50000')).toBe('0.00');
  });
});

describe('13th month exemption', () => {
  const at = (s: string) => peso(thirteenthMonthTaxable(P(s), '2026-03'));

  it('exempts up to 90,000', () => {
    expect(at('50000')).toBe('0.00');
    expect(at('90000')).toBe('0.00');
  });

  it('taxes only the excess', () => {
    expect(at('90000.01')).toBe('0.01');
    expect(at('150000')).toBe('60000.00');
  });
});

describe('SSS', () => {
  it('throws NotSourcedError rather than returning a guessed figure', () => {
    // A wrong bracket is worse than a missing one: a caller can handle this,
    // but silently wrong deductions surface months later as a DOLE finding.
    expect(() => sss(P('25000'), '2026-03')).toThrow(NotSourcedError);
    expect(() => sss(P('25000'), '2026-03')).toThrow(/Circular No. 2024-006/);
  });
});
