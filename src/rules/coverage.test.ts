import { describe, it, expect } from 'vitest';
import { coverage, isPeriodSupported } from './coverage.js';
import { computePayroll } from '../compute/payroll.js';
import { NoRuleError } from './types.js';

describe('coverage()', () => {
  const c = coverage();

  it('reports a window for every contribution', () => {
    const names = new Set(c.windows.map((w) => w.contribution));
    expect([...names].sort()).toEqual(['bir', 'pagIbig', 'philHealth', 'sss']);
  });

  it('cites a source for every window', () => {
    for (const w of c.windows) {
      expect(w.source.length, w.contribution).toBeGreaterThan(10);
    }
  });

  it('marks still-in-force windows with a null end rather than a fake date', () => {
    expect(c.windows.every((w) => w.to === null)).toBe(true);
  });

  it('reports the real floor, set by the latest-starting contribution', () => {
    // PhilHealth's CY2026 schedule is the binding constraint. BIR reaches back to
    // 2023-01 and Pag-IBIG to 2024-02, but computePayroll needs all four.
    expect(c.fullySupportedFrom).toBe('2026-01');
    const philHealth = c.windows.find((w) => w.contribution === 'philHealth')!;
    expect(philHealth.from).toBe('2026-01');
  });

  it('agrees with what computePayroll actually does', () => {
    // The whole point: the advertised floor and the real floor cannot drift.
    expect(() => computePayroll({ monthlyBasic: '25000', period: c.fullySupportedFrom })).not.toThrow();

    const [y, m] = c.fullySupportedFrom.split('-').map(Number) as [number, number];
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    expect(() => computePayroll({ monthlyBasic: '25000', period: prev })).toThrow(NoRuleError);
  });
});

describe('isPeriodSupported()', () => {
  it('is false before the floor and true at or after it', () => {
    expect(isPeriodSupported('2023-06')).toBe(false);
    expect(isPeriodSupported('2024-06')).toBe(false);
    expect(isPeriodSupported('2025-12')).toBe(false);
    expect(isPeriodSupported('2026-01')).toBe(true);
    expect(isPeriodSupported('2026-09')).toBe(true);
  });

  it('matches computePayroll for every period it is asked about', () => {
    for (const p of ['2023-06', '2024-06', '2025-06', '2025-12', '2026-01', '2026-09', '2030-01']) {
      let threw = false;
      try {
        computePayroll({ monthlyBasic: '25000', period: p });
      } catch {
        threw = true;
      }
      expect(isPeriodSupported(p), p).toBe(!threw);
    }
  });

  it('rejects a malformed period rather than reporting false', () => {
    // false would read as "not covered"; this is "not a period".
    expect(() => isPeriodSupported('2026-13')).toThrow(RangeError);
    expect(() => isPeriodSupported('nope')).toThrow(RangeError);
  });
});

describe('NoRuleError points at the way out', () => {
  it('names the encoded windows and the helper to call', () => {
    try {
      computePayroll({ monthlyBasic: '25000', period: '2020-01' });
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/Encoded windows/);
      expect(msg).toMatch(/coverage\(\)/);
      expect(msg).toMatch(/isPeriodSupported/);
      expect(msg).toMatch(/not approximated/);
    }
  });
});
