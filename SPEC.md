# Philippine payroll statutory computation: specification

The precise rules this library implements, with sources and effective dates.

**This file is the contract.** Code implements it; tests assert against it. If a circular
changes, the change lands here first, with its effective date and citation, and only then in code.

## Why this is legally publishable

[RA 8293 §176](https://en.wikipedia.org/wiki/Wikipedia:Philippines_copyright_law): no copyright
subsists in a work of the Government of the Philippines, and while exploiting such a work for
profit normally needs prior agency approval, the section carves out an exception:

> "No prior approval or conditions shall be required for the use **for any purpose** of statutes,
> rules and regulations..."

Every rule below comes from a statute or an agency circular. All four sit inside that carve-out:
no approval, no royalties, any purpose.

This is a reading of the statute, not legal advice. Confirm with a PH IP lawyer before
building a business on it.

---

## 1. Core model: rules are effective-dated, never "current"

A payroll run for March 2024 must use the rules **as they stood in March 2024**. A back-computation,
an amended return, or a BIR audit all need history, and every third-party site publishes only
today's table.

Every rule set therefore carries `effectiveFrom` and optional `effectiveTo`, and every computation
takes the **period being paid**, not the date of the request:

```ts
computeStatutory({ monthlyBasic, period: '2024-03' })
```

Resolution: the rule set whose window contains `period`. If more than one matches, that is a data
error and must throw, not pick one.

## 2. Money representation

Identical to the `fx-rate-api` decimal core, reused verbatim: `bigint` scaled by 10^18, half-even
rounding applied once at the boundary, strings on the wire. Never `number`, never `parseFloat`.

Peso amounts round to **2 decimal places**. Where an agency specifies a different rounding, that
rounding is named in the rule below and applied at that step.

## 3. Order of operations

Order matters. Statutory deductions reduce taxable income, so they must be computed first.

```
1. monthlyBasic                       (input, the employee's basic pay for the period)
2. SSS        employee + employer + EC     from MSC bracket
3. PhilHealth employee + employer           from rate, floor, ceiling
4. Pag-IBIG   employee + employer           from rate tier, capped
5. taxableIncome = monthlyBasic
                 - SSS.employee
                 - PhilHealth.employee
                 - Pag-IBIG.employee
                 - other non-taxable items
6. withholdingTax                           from the graduated table
7. netPay = monthlyBasic - employeeDeductions - withholdingTax
```

Only the **employee** share reduces taxable income. Employer shares are a cost to the employer and
never touch the employee's tax base.

---

## 4. BIR withholding tax

**Source:** TRAIN (RA 10963), second-phase rates, effective 1 January 2023. Unchanged for 2024,
2025 and 2026. **Verified** across multiple independent sources.

Annual taxable income:

| Over | Not over | Tax |
|---|---|---|
| 0 | ₱250,000 | 0 |
| ₱250,000 | ₱400,000 | 15% of excess over ₱250,000 |
| ₱400,000 | ₱800,000 | ₱22,500 + 20% of excess over ₱400,000 |
| ₱800,000 | ₱2,000,000 | ₱102,500 + 25% of excess over ₱800,000 |
| ₱2,000,000 | ₱8,000,000 | ₱402,500 + 30% of excess over ₱2,000,000 |
| ₱8,000,000 | — | ₱2,202,500 + 35% of excess over ₱8,000,000 |

Monthly exemption threshold: **₱20,833** of taxable compensation.

**13th month pay and other benefits:** exempt up to **₱90,000** per year, applied at
annualisation. Any excess is taxable and folded into December's taxable compensation.

**Implementation note.** The monthly/semi-monthly withholding tables published by BIR are derived
from the annual table. Implement the annual table as the single source of truth and derive the
periodic figures, rather than transcribing four separate tables that can disagree with each other.

## 5. PhilHealth

**Source:** [RA 11223](https://pia.gov.ph/news/philhealth-sets-5-premium-contribution-rate-for-2026/)
(Universal Health Care Act). The 5% rate for 2026 is the **final scheduled adjustment** under the
law. **Verified.**

| Field | Value (CY 2026) |
|---|---|
| Premium rate | 5% of monthly basic salary |
| Income floor | ₱10,000 |
| Income ceiling | ₱100,000 |
| Split | 2.5% employee, 2.5% employer |
| Minimum premium | ₱500/month total |
| Maximum premium | ₱5,000/month total |

```
base    = clamp(monthlyBasic, 10_000, 100_000)
premium = base × 0.05
employee = employer = premium / 2
```

Rates for earlier years differ (the UHC Act stepped the rate up annually). Each year is its own
effective-dated rule set, and **the historical rates are not yet sourced** (see §8).

## 6. Pag-IBIG (HDMF)

**Source:** HDMF Circular No. 460, Maximum Fund Salary raised ₱5,000 → ₱10,000 effective
**February 2024**, unchanged through 2026. **Verified.**

| Monthly compensation | Employee | Employer |
|---|---|---|
| ≤ ₱1,500 | 1% | 2% |
| > ₱1,500 | 2% | 2% |

```
fundSalary = min(monthlyBasic, 10_000)      // Maximum Fund Salary cap
employee   = fundSalary × (monthlyBasic <= 1500 ? 0.01 : 0.02)
employer   = fundSalary × 0.02
```

Maximum ₱200 employee, ₱200 employer, ₱400 total, which falls out of the ₱10,000 cap rather than
being a separate rule. Implement the cap on the base, not on the result, so the two cannot drift.

**Note the discontinuity:** the tier is chosen on *actual* compensation but applied to the *capped*
fund salary. At exactly ₱1,500 the employee rate is 1%; at ₱1,500.01 it is 2%. Test both sides.

## 7. SSS

**Source:** SSS Circular No. 2024-006, "Schedule of SSS Contributions Effective January 2025",
signed 19 December 2024. Issued under RA 11199 (Social Security Act of 2018) and SSC Resolution
No. 560-s.2024. Repeals Circular 2022-033. **Read from the circular itself.**

Three programmes share one schedule:

| Programme | Funded by | Paid by |
|---|---|---|
| Regular SS | MSC up to ₱20,000 | 10% employer, 5% employee |
| **MPF** (Mandatory Provident Fund) | MSC above ₱20,000, up to ₱35,000 | 10% employer, 5% employee |
| EC (Employees' Compensation) | flat amount | **employer only** |

Note the programme above ₱20,000 is the **Mandatory Provident Fund**, credited to the member's
individual account. It is not WISP.

| Field | Value |
|---|---|
| MSC floor / ceiling | ₱5,000 / ₱35,000 |
| MSC step | ₱500 |
| Regular SS ceiling | ₱20,000 |
| EC | ₱10 below MSC ₱15,000, ₱30 at or above |

**Bracket mapping.** The published rows run "X,250 to X,749.99 → MSC X,500", with "BELOW 5,250" at
the floor and "34,750 and Over" at the ceiling. That is a ₱500 rounding whose boundary sits ₱250
above each step, so adding 250 before flooring puts the boundary in the right place:

```
msc = clamp(floor((compensation + 250) / 500) * 500, 5_000, 35_000)
```

**EC never touches the employee.** It is an employer premium and does not reduce taxable income.

**Verification.** The implementation derives the schedule rather than looking it up, and
`src/rules/sss.table.test.ts` carries all **61 published rows** transcribed from page 2 of the
circular and asserts the derivation reproduces every one, plus both edges of every range. A
transcription slip and a formula slip cannot hide behind each other.

## 8. Known gaps

Nothing below is implemented, and none of it should be guessed:

- PhilHealth historical rates before 2026 (the UHC Act stepped the rate up each year)
- SSS, Pag-IBIG and BIR rule sets for years before their current circulars
- Contributions for compensation below ₱5,000: the schedule floors the MSC at ₱5,000, so a
  part-time earner contributes as though earning ₱5,000. That is what the circular says; whether
  every employer applies it that way is a separate question
- Whether an SSS circular distinct to 2026 exists. As of this writing, no confirmed 2026 circular
  was found, yet several third-party sites publish a "2026 table" anyway. Treat those as unsourced.
- Self-employed, voluntary, OFW and kasambahay schedules. Employed members only for now.
- De minimis benefits, and which allowances are non-taxable

## 9. Testing rules

- **Golden values are computed independently**, never by running the implementation and pasting
  what it printed. Verify with `python3 -c "from decimal import ..."` or by hand against the
  published table.
- Every bracket boundary is tested on **both sides**, plus exactly on the boundary.
- Effective-dating is tested by computing the same salary for two periods spanning a rule change
  and asserting the results differ.
- No test uses a float literal for a peso amount.
