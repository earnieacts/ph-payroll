# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `coverage()` and `isPeriodSupported(period)` — query which periods can be computed, and the
  circular behind each window, without catching an error per employee.

### Changed

- `NoRuleError` now names the encoded windows, states that earlier periods are **not
  approximated**, and points at `coverage()` / `isPeriodSupported()`.

## [0.1.0] - 2026-09-15

First release.

### Added

- `computePayroll()` — full monthly statutory computation: SSS, PhilHealth, Pag-IBIG and BIR
  withholding, in the order that matters (employee-side contributions reduce taxable income).
- Individual rules exported for callers doing their own arithmetic: `sss`, `monthlySalaryCredit`,
  `philHealth`, `pagIbig`, `annualTax`, `monthlyWithholding`, `thirteenthMonthTaxable`.
- Exact decimal arithmetic. Every amount is a `bigint` at 10^18 internally and a **string** at the
  API surface, rounded half-even exactly once. No floats anywhere near a peso.
- Effective-dated rules. Every computation takes the period being *paid*, not today's date.

### Coverage in this release

**`computePayroll` supports 2026-01 onward only.** Earlier periods throw `NoRuleError` rather than
approximating. Rules are encoded from the circular that introduced them, and the four circulars did
not take effect together:

| Contribution | From | Source |
|---|---|---|
| BIR withholding | 2023-01 | TRAIN (RA 10963), 2nd phase |
| Pag-IBIG | 2024-02 | HDMF Circular 460 |
| SSS | 2025-01 | SSS Circular 2024-006 |
| PhilHealth | 2026-01 | RA 11223, CY2026 — the binding constraint |

If you need a 2024 or 2025 payroll run, this release cannot do it. That is deliberate: applying
2026 rates to an older period would be wrong on every line, and silently so.

### Verification

- The SSS schedule is **derived**, then cross-checked against all 61 rows transcribed from page 2 of
  Circular 2024-006, plus both edges of every range. A formula error and a transcription error
  cannot hide behind each other.
- Golden values were computed independently in Python's `decimal` at 40 digits, never by running
  the implementation and pasting its output.
- CI runs the suite on Node 20/22/24 and installs the packed tarball on Node 18/20/22/24, so the
  `engines: >=18` claim is exercised rather than asserted.

### Known gaps

- Historical rule sets before each circular above.
- Self-employed, voluntary, OFW and kasambahay schedules. Employed members only.
- De minimis benefits, and which allowances are non-taxable.

[Unreleased]: https://github.com/earnieacts/ph-payroll/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/earnieacts/ph-payroll/releases/tag/v0.1.0
