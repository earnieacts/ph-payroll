/**
 * Fixed-point decimal core.
 *
 * Every rate and every monetary amount in this codebase is a `Scaled`: a bigint
 * holding the value multiplied by 10^18. `number` never touches a rate or an
 * amount — not in parsing, not in arithmetic, not in fixtures. IEEE-754 cannot
 * represent 0.1, and an API whose whole product is "the number is right" cannot
 * afford that.
 *
 * Rounding is half-even (banker's) everywhere. Half-up biases upward, and across
 * millions of conversions that bias is a real, one-directional error.
 */

/** Decimal places of the internal fixed-point representation. */
export const SCALE_DP = 18;

/** 10^SCALE_DP. One unit, in the internal representation. */
export const RATE_SCALE = 10n ** BigInt(SCALE_DP);

/** A decimal value scaled by 10^SCALE_DP. */
export type Scaled = bigint;

export class DecimalParseError extends Error {
  constructor(input: string, reason: string) {
    super(`cannot parse decimal ${JSON.stringify(input)}: ${reason}`);
    this.name = 'DecimalParseError';
  }
}

const DECIMAL_RE = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/**
 * Parse a plain decimal string into the internal representation.
 *
 * Strict by design: no exponents, no whitespace, no thousands separators, no
 * bare ".5". Upstream feeds that use any of those get an explicit adapter, so a
 * surprising format surfaces as a rejected snapshot rather than a wrong rate.
 *
 * Digits beyond SCALE_DP are rounded half-even rather than truncated.
 */
export function parseDecimal(input: string): Scaled {
  if (typeof input !== 'string') throw new DecimalParseError(String(input), 'not a string');
  const m = DECIMAL_RE.exec(input);
  if (!m) throw new DecimalParseError(input, 'not a plain decimal literal');

  const [, sign, intPart, fracPart = ''] = m as unknown as [string, string, string, string?];
  const neg = sign === '-';

  if (fracPart.length <= SCALE_DP) {
    const digits = intPart + fracPart.padEnd(SCALE_DP, '0');
    const v = BigInt(digits);
    return neg ? -v : v;
  }

  // More precision than we keep: round half-even on the discarded tail.
  const keep = fracPart.slice(0, SCALE_DP);
  const drop = fracPart.slice(SCALE_DP);
  const base = BigInt(intPart + keep);
  const v = base + roundIncrement(BigInt(drop), 10n ** BigInt(drop.length), base);
  return neg ? -v : v;
}

/**
 * Decide the half-even increment for a truncated division.
 *
 * `rem`/`div` is the discarded fraction of a non-negative quotient whose
 * truncated value is `quotient`. Returns 0n or 1n.
 */
function roundIncrement(rem: bigint, div: bigint, quotient: bigint): bigint {
  if (rem === 0n) return 0n;
  const twice = rem * 2n;
  if (twice > div) return 1n;
  if (twice < div) return 0n;
  // Exactly half — round to even.
  return quotient % 2n === 0n ? 0n : 1n;
}

/** Divide two bigints with half-even rounding. `b` must be non-zero. */
function divHalfEven(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError('division by zero');
  const neg = a < 0n !== b < 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  const q = absA / absB;
  const r = absA % absB;
  const out = q + roundIncrement(r, absB, q);
  return neg ? -out : out;
}

/** Multiply two scaled values, half-even. */
export function mul(a: Scaled, b: Scaled): Scaled {
  return divHalfEven(a * b, RATE_SCALE);
}

/** Divide two scaled values, half-even. */
export function div(a: Scaled, b: Scaled): Scaled {
  return divHalfEven(a * RATE_SCALE, b);
}

/** Rescale a scaled value to `dp` decimal places, half-even. Result is scaled by 10^dp. */
export function roundTo(v: Scaled, dp: number): bigint {
  assertDp(dp);
  return divHalfEven(v, 10n ** BigInt(SCALE_DP - dp));
}

/**
 * Format with exactly `dp` decimal places. Always a string — a JS client doing
 * JSON.parse on 0.000000012345678901 loses precision to IEEE-754, so strings are
 * the wire format and `?format=number` is an opt-in with a docs warning.
 */
export function formatFixed(v: Scaled, dp: number): string {
  assertDp(dp);
  const scaled = roundTo(v, dp);
  const neg = scaled < 0n;
  const digits = (neg ? -scaled : scaled).toString().padStart(dp + 1, '0');
  const intPart = digits.slice(0, digits.length - dp);
  const frac = dp === 0 ? '' : '.' + digits.slice(digits.length - dp);
  return (neg ? '-' : '') + intPart + frac;
}

/**
 * Format preserving at least `minSig` significant digits, with at least `minDp`
 * decimal places and at most `maxDp`.
 *
 * This is what stops BTC/USD rendering as "0.00". A fixed 8-dp format is fine
 * for fiat and useless for a satoshi-scale ratio.
 */
export function formatSignificant(
  v: Scaled,
  { minDp = 8, minSig = 8, maxDp = SCALE_DP }: { minDp?: number; minSig?: number; maxDp?: number } = {},
): string {
  assertDp(minDp);
  assertDp(maxDp);
  if (v === 0n) return formatFixed(0n, minDp);

  const abs = v < 0n ? -v : v;
  // Position of the first significant digit relative to the decimal point.
  // abs >= RATE_SCALE means the value is >= 1, so leadingZeros is 0.
  const digitCount = abs.toString().length;
  const leadingZeros = Math.max(0, SCALE_DP - digitCount + 1);
  const dp = Math.min(maxDp, Math.max(minDp, leadingZeros + minSig - 1));
  return trimTrailingZeros(formatFixed(v, dp), minDp);
}

function trimTrailingZeros(s: string, minDp: number): string {
  if (!s.includes('.')) return s;
  const [int = '', frac = ''] = s.split('.');
  let end = frac.length;
  while (end > minDp && frac[end - 1] === '0') end--;
  return end === 0 ? int : `${int}.${frac.slice(0, end)}`;
}

function assertDp(dp: number): void {
  if (!Number.isInteger(dp) || dp < 0 || dp > SCALE_DP) {
    throw new RangeError(`dp must be an integer in [0, ${SCALE_DP}], got ${dp}`);
  }
}

/** Absolute value. */
export function abs(v: Scaled): Scaled {
  return v < 0n ? -v : v;
}

/**
 * Relative difference |a - b| / |b|, as a scaled value.
 * Used by the ingest outlier guards. `b` must be non-zero.
 */
export function relativeDiff(a: Scaled, b: Scaled): Scaled {
  return div(abs(a - b), abs(b));
}
