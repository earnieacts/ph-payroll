# ph-payroll

Philippine payroll statutory computation. Exact decimals, effective-dated rules, sourced from the
circulars themselves.

**Status: early but complete for the current rules.** All four statutory contributions are
implemented and sourced from their circulars. Verify against your own payroll before relying on it.

## Why this exists

The contribution tables and tax brackets are published as PDFs and circulars. Dozens of sites
republish them as blog posts. None of it is machine-readable, none of it is effective-dated, and
a payroll run for March 2024 needs the rules *as they stood in March 2024*, which no blog gives you.

## Three design rules

**Money is never a float.** Every peso amount is a `bigint` scaled by 10^18, rounded half-even
exactly once at the boundary, and emitted as a string. `parseFloat` on `25000.55` is a wrong
deduction on someone's payslip.

**Rules are effective-dated, never "current".** Every computation takes the period being *paid*.
Asking for a period with no encoded rule set throws, rather than silently applying today's rates
to a 2023 back-computation.

**A missing rule beats a guessed one.** Nothing is encoded from a secondary source. The SSS
schedule is derived, then cross-checked against all 61 rows transcribed from the circular, so a
formula error and a transcription error cannot hide behind each other. Silently wrong statutory
deductions surface months later as a DOLE or BIR finding, by which time they have been wrong on
every payslip since.

## Install

```bash
npm install ph-payroll
```

Zero runtime dependencies. ESM only. Requires Node 18+ (it uses `bigint`, and imports no Node
built-ins at all, so it runs in any modern runtime including browsers and edge workers).

## Use

```ts
import { computePayroll } from 'ph-payroll';

const r = computePayroll({ monthlyBasic: '25000', period: '2026-03' });

r.contributions.sss.msc;             // '25000.00'
r.contributions.sss.employee;        // '1250.00'
r.contributions.sss.mpfMsc;          // '5000.00'   (the slice above 20,000)
r.contributions.sss.ec;              // '30.00'     (employer-only)
r.contributions.philHealth.employee; // '625.00'
r.contributions.pagIbig.employee;    // '200.00'    (capped at the Maximum Fund Salary)
r.taxableIncome;                     // '22925.00'
r.withholdingTax;                    // '313.75'
r.netPay;                            // '22611.25'
r.employerCost;                      // '3355.00'
```

Amounts go in and come out as **strings**. Parse them with a decimal library, never `Number()`.

Individual rules are exported too, for callers doing their own arithmetic:

```ts
import { sss, monthlySalaryCredit, annualTax, parseDecimal, formatFixed } from 'ph-payroll';

const msc = monthlySalaryCredit(parseDecimal('14749.99'), '2026-03');
formatFixed(msc, 2); // '14500.00' — one centavo more would be 15,000

sss(parseDecimal('50000'), '2026-03').mpfMsc; // the slice above 20,000
```

These work in `Scaled`, a `bigint` at 10^18. `computePayroll` handles that conversion itself.

## Which periods it can compute

**`computePayroll` works from 2026-01 onward.** Earlier periods throw `NoRuleError`.

That floor is not arbitrary: rules are encoded only from the circular that introduced them, and the
four circulars did not take effect together. `computePayroll` needs all four, so it is limited by
the most recent.

| Contribution | Encoded from | Source |
|---|---|---|
| BIR withholding | 2023-01 | TRAIN (RA 10963), 2nd phase |
| Pag-IBIG | 2024-02 | HDMF Circular 460 |
| SSS | 2025-01 | SSS Circular 2024-006 |
| **PhilHealth** | **2026-01** | RA 11223, CY2026 schedule — **the binding constraint** |

Check before computing rather than catching per employee:

```ts
import { coverage, isPeriodSupported } from 'ph-payroll';

coverage().fullySupportedFrom;   // '2026-01'
isPeriodSupported('2025-06');    // false
isPeriodSupported('2026-03');    // true

coverage().windows;              // every window, with the circular that set it
```

Individual rules reach further back than `computePayroll` does. `annualTax(taxable, '2023-06')`
works, because BIR is encoded from 2023-01, even though a full payroll run for that month is not.

**Nothing is approximated.** A period with no encoded rule fails loudly rather than quietly
applying today's rates to a 2024 back-computation. Widening coverage means finding the older
circular and encoding it — see [Contributing](#contributing).

## What is implemented

| | Basis | Status |
|---|---|---|
| **BIR withholding** | TRAIN (RA 10963), 2nd phase, from 2023-01 | Implemented |
| **PhilHealth** | RA 11223 (UHC Act), CY2026 | Implemented, 2026 only |
| **Pag-IBIG** | HDMF Circular 460, from 2024-02 | Implemented |
| **SSS** | Circular 2024-006, from 2025-01 | Implemented, all 61 rows verified |

[`SPEC.md`](./SPEC.md) is the contract. Code implements it, tests assert against it, and a
circular change lands there first with its citation.

## Licensing of the underlying data

[RA 8293 §176](https://en.wikipedia.org/wiki/Wikipedia:Philippines_copyright_law) removes copyright
from works of the Philippine Government, and while exploiting one for profit normally needs prior
agency approval, it carves out an exception: *"No prior approval or conditions shall be required
for the use for any purpose of statutes, rules and regulations..."*

Every rule here comes from a statute or an agency circular, so all of it sits inside that carve-out.
This is a reading of the statute, not legal advice.

## Develop

Node 22 and pnpm for development (`npm install` fails on the author's machine with an arborist
bug). The published library itself needs only Node 18.

```bash
nvm use && pnpm install
pnpm test        # 129 tests
pnpm typecheck
pnpm build       # tsc -> dist/
```

`prepublishOnly` runs clean + typecheck + tests + build, so a broken build cannot be published.
That matters: npm blocks unpublish after 72 hours and burns the version number permanently.

Releases are automated. Pushing a version bump to `main` publishes it:

```bash
npm version patch
git push origin main --follow-tags
```

CI publishes only when `package.json`'s version differs from what is already on npm, using npm
Trusted Publishing (OIDC) rather than a stored token.

Golden test values are computed independently in Python's `decimal`, never by running the
implementation and pasting the output. A test that asserts the code agrees with itself proves only
self-consistency.

## Contributing

The most useful contributions now are **historical rule sets**: PhilHealth's annual rates before
2026, Pag-IBIG before Circular 460, and SSS before Circular 2024-006. Each one makes a further year
of back-computation possible.

From the circular itself, never a secondary site. See SPEC.md §8.

MIT.
