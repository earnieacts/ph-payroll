import { describe, it, expect } from 'vitest';
import {
  RATE_SCALE,
  SCALE_DP,
  parseDecimal,
  formatFixed,
  formatSignificant,
  mul,
  div,
  relativeDiff,
  DecimalParseError,
} from './index.js';

describe('parseDecimal', () => {
  it('parses integers and fractions exactly', () => {
    expect(parseDecimal('1')).toBe(RATE_SCALE);
    expect(parseDecimal('0')).toBe(0n);
    expect(parseDecimal('1.08234')).toBe(1_082_340_000_000_000_000n);
    expect(parseDecimal('-2.5')).toBe(-2_500_000_000_000_000_000n);
  });

  it('parses the full 18-dp precision without loss', () => {
    expect(parseDecimal('0.000000000000000001')).toBe(1n);
  });

  it('rounds half-even beyond 18 dp rather than truncating', () => {
    // 19th digit is 5 with nothing after: ties-to-even.
    expect(parseDecimal('0.0000000000000000025')).toBe(2n); // 2 is even, stays
    expect(parseDecimal('0.0000000000000000035')).toBe(4n); // 3 -> 4, to even
    expect(parseDecimal('0.0000000000000000026')).toBe(3n); // above half, up
  });

  it('rejects anything that is not a plain decimal literal', () => {
    for (const bad of ['1e5', ' 1', '1 ', '1,000', '.5', '1.', '', 'NaN', 'Infinity', '0x10']) {
      expect(() => parseDecimal(bad), bad).toThrow(DecimalParseError);
    }
  });
});

describe('formatFixed', () => {
  it('emits exactly dp decimal places', () => {
    expect(formatFixed(parseDecimal('1.5'), 2)).toBe('1.50');
    expect(formatFixed(parseDecimal('1.5'), 0)).toBe('2'); // ties-to-even: 1.5 -> 2
    expect(formatFixed(parseDecimal('2.5'), 0)).toBe('2'); // ties-to-even: 2.5 -> 2
    expect(formatFixed(parseDecimal('0.125'), 2)).toBe('0.12');
    expect(formatFixed(parseDecimal('0.135'), 2)).toBe('0.14');
  });

  it('handles negatives symmetrically', () => {
    expect(formatFixed(parseDecimal('-1.5'), 0)).toBe('-2');
    expect(formatFixed(parseDecimal('-0.125'), 2)).toBe('-0.12');
  });

  it('pads values below one', () => {
    expect(formatFixed(parseDecimal('0.01'), 4)).toBe('0.0100');
  });
});

describe('formatSignificant', () => {
  it('keeps very small ratios legible instead of collapsing to 0.00', () => {
    // A sub-1e-5 ratio, e.g. a per-unit rate
    const r = div(RATE_SCALE, parseDecimal('108340'));
    expect(formatFixed(r, 2)).toBe('0.00'); // why a flat dp is not enough
    expect(formatSignificant(r, { minDp: 8, minSig: 8 })).toBe('0.0000092302012');
  });

  it('never drops below minDp', () => {
    expect(formatSignificant(parseDecimal('1.5'), { minDp: 8, minSig: 8 })).toBe('1.50000000');
  });

  it('formats zero at minDp', () => {
    expect(formatSignificant(0n, { minDp: 8 })).toBe('0.00000000');
  });
});

describe('mul / div', () => {
  it('round-trips a value through multiply and divide', () => {
    const a = parseDecimal('1234.56');
    const r = parseDecimal('148.23');
    expect(div(mul(a, r), r)).toBe(a);
  });

  it('is exact for values representable at 18 dp', () => {
    expect(mul(parseDecimal('2'), parseDecimal('0.5'))).toBe(RATE_SCALE);
    expect(div(parseDecimal('1'), parseDecimal('4'))).toBe(parseDecimal('0.25'));
  });

  it('refuses division by zero rather than producing Infinity', () => {
    expect(() => div(RATE_SCALE, 0n)).toThrow(RangeError);
  });
});

describe('relativeDiff', () => {
  it('measures a proportional change', () => {
    expect(relativeDiff(parseDecimal('102'), parseDecimal('100'))).toBe(parseDecimal('0.02'));
    expect(relativeDiff(parseDecimal('98'), parseDecimal('100'))).toBe(parseDecimal('0.02'));
  });
});

describe('float contamination', () => {
  it('parses the classic 0.1 + 0.2 case exactly', () => {
    const sum = parseDecimal('0.1') + parseDecimal('0.2');
    expect(formatFixed(sum, SCALE_DP)).toBe('0.300000000000000000');
    // For contrast, this is what the codebase must never do:
    expect(0.1 + 0.2).not.toBe(0.3);
  });
});
