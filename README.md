# ph-payroll

Philippine payroll statutory computation. Exact decimals, effective-dated rules, sourced from the
circulars themselves.

**Status: early. SSS is not implemented yet and the library says so loudly.** Do not put these
figures on a payslip until that gap is closed.

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

**A missing rule beats a guessed one.** SSS throws `NotSourcedError` naming the exact circular to
read. A caller can handle that. Silently wrong statutory deductions surface months later as a DOLE
or BIR finding, by which time they have been wrong on every payslip since.

## Use

```ts
import { computePayroll } from 'ph-payroll';

const r = computePayroll({ monthlyBasic: '25000', period: '2026-03' });

r.contributions.philHealth.employee; // '625.00'
r.contributions.pagIbig.employee;    // '200.00'  (capped at the Maximum Fund Salary)
r.taxableIncome;                     // '24175.00'
r.withholdingTax;                    // '501.25'
r.netPay;                            // '23673.75'
r.warnings;                          // ['SSS is EXCLUDED from this computation...']
```

Amounts go in and come out as **strings**. Parse them with a decimal library, never `Number()`.

## What is implemented

| | Basis | Status |
|---|---|---|
| **BIR withholding** | TRAIN (RA 10963), 2nd phase, from 2023-01 | Implemented |
| **PhilHealth** | RA 11223 (UHC Act), CY2026 | Implemented, 2026 only |
| **Pag-IBIG** | HDMF Circular 460, from 2024-02 | Implemented |
| **SSS** | Circular 2024-006, from 2025-01 | **Not implemented.** See SPEC.md §7 |

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

Requires Node 22 and pnpm (`npm install` fails on this machine with an arborist bug).

```bash
nvm use && pnpm install
pnpm test        # 55 tests
pnpm typecheck
```

Golden test values are computed independently in Python's `decimal`, never by running the
implementation and pasting the output. A test that asserts the code agrees with itself proves only
self-consistency.

## Contributing

The most useful contribution is **transcribing SSS Circular No. 2024-006**: the MSC bracket
boundaries, the EC cut-over, and the WISP split above MSC 20,000. From the circular itself, not
from a secondary site. See SPEC.md §7 and §8.

MIT.
