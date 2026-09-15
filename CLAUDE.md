# CLAUDE.md — ph-payroll

Guidance for Claude Code when working in this repository.

## What this is

A **zero-dependency TypeScript library** computing Philippine payroll statutory contributions and
withholding tax: SSS, PhilHealth, Pag-IBIG and BIR.

**There is no server here.** No Hono, no Cloudflare Workers, no HTTP, no `fetch`. `package.json`
has an empty `dependencies` block and only three devDependencies. A consumer imports a function and
gets a result. If an API or a calculator is built later it wraps this library; it does not live in it.

That is a deliberate constraint, not an accident of being early. A statutory computation library
that drags in a web framework cannot be used inside someone else's payroll system, which is the
whole point.

It is a sibling of `../fx-rate-api` and reuses its decimal core verbatim, but shares nothing else.

## Non-negotiable constraints

1. **Never a float for money.** `number`, `parseFloat`, `Number()`, `toFixed` and float literals are
   banned for any peso amount, rate or percentage. Internal type is `bigint` at `RATE_SCALE = 10n ** 18n`
   (`src/decimal/index.ts`). Round half-even, exactly once, at the boundary. Every amount in and out
   is a **string**. `parseFloat('25000.55')` is a wrong deduction on someone's payslip.
2. **Rules are effective-dated, never "current".** Every computation takes the period being **paid**,
   not today's date. A March 2024 run needs March 2024's rules. Asking for an uncovered period throws
   `NoRuleError`; it never falls back to the nearest rule set.
3. **Overlapping rule windows throw.** Choosing one would produce a plausible wrong answer, which is
   the worst possible outcome here. An exception is recoverable; a silently wrong deduction is not.
4. **Nothing is encoded from a secondary source.** Every rule cites its circular, statute or
   resolution in a `source` field that reaches the caller. Blogs and SEO sites republishing
   contribution tables are not sources, and several of them publish figures that do not exist.
5. **A missing rule beats a guessed one.** If a rule cannot be sourced, it throws with the document
   to read. Wrong statutory deductions surface months later as a DOLE or BIR finding, by which point
   they have been wrong on every payslip since.
6. **Derived tables are cross-checked against the published rows.** The SSS schedule is computed by
   formula, and `src/rules/sss.table.test.ts` asserts it reproduces all 61 rows transcribed from the
   circular. A formula error and a transcription error must not be able to hide behind each other.
7. **Only the employee share reduces taxable income.** Employer contributions, and SSS's EC premium
   in particular, are employer costs and never touch the employee's tax base. Order of operations in
   `src/compute/payroll.ts` is load-bearing: statutory contributions are computed before tax.
8. **Golden test values are computed independently**, in Python's `decimal`, never by running the
   implementation and pasting what it printed. A test that asserts the code agrees with itself
   proves only self-consistency.
9. **`SPEC.md` is the contract.** A circular change lands there first, with its citation and
   effective date, and only then in code.

## Layout

```
SPEC.md                     the contract: every rule, its source, its effective date
src/decimal/index.ts        bigint fixed-point core, reused verbatim from ../fx-rate-api
src/rules/types.ts          effective-dating, rule resolution, shared result shapes
src/rules/sss.ts            SSS: Regular SS + MPF + EC, derived from the bracket formula
src/rules/sss.table.test.ts all 61 published rows, cross-checking the derivation
src/rules/philhealth.ts     PhilHealth premium
src/rules/pagibig.ts        Pag-IBIG (HDMF)
src/rules/bir.ts            withholding tax; the ANNUAL table is the single source of truth
src/compute/payroll.ts      orchestrator; order of operations lives here
```

Tests sit next to the module they cover, as `*.test.ts`.

## Commands

**Use `pnpm`, not `npm`.** `npm install` fails on this machine with an arborist bug
(`Cannot read properties of null (reading 'edgesOut')`). pnpm resolves the same tree fine.

| Command | What it does |
|---|---|
| `pnpm test` | `vitest run` |
| `pnpm test:watch` | Watch mode |
| `pnpm typecheck` | `tsc --noEmit` |

## Verified on this machine (2026-09-15)

**node v22.23.2** (pinned by `.nvmrc`; run `nvm use`) · pnpm 10.13.1. Node 20 will not work.

```
npx vitest run     # Test Files 4 passed, Tests 129 passed
npx tsc --noEmit   # exit 0
```

Build with `pnpm build` (`tsc -p tsconfig.build.json` into `dist/`). There is no bundler and no
server to start; `tsc --noEmit`, the test suite and a clean build are the whole gate, and
`prepublishOnly` runs all three.

Published to npm as **`ph-payroll`**, ESM only, zero runtime dependencies. `engines` is `>=18`:
the library imports no `node:` builtins and uses nothing past ES2020 beyond `bigint`, so it also
runs in browsers and edge runtimes. Do not raise that floor without a reason that actually exists.

## Conventions

- Strict TypeScript: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`. Relative imports carry the `.js` extension.
- Every bracket boundary is tested on **both sides**, plus exactly on it. The published tables are
  ranges, and an off-by-one at a boundary is the characteristic bug in payroll code.
- Amounts are `Scaled` (bigint) internally and strings at the API surface. A `number` anywhere near
  a peso is a review finding.
- Conventional Commits, scopes: `sss, philhealth, pagibig, bir, decimal, compute, spec, deps`.
- **Single `main` branch.** Unlike the sibling `fx-rate-api`, this is a published library, not a
  deployed product: releases are npm versions and git tags, not a branch promotion. A develop/main
  split would just be ceremony contributors have to learn.
- MIT licensed, and it should stay that way: distribution is the point, not the moat.
- **The repo is public.** Nothing local-only may be committed; `.claude/` is gitignored and must
  stay that way.

## The legal basis for publishing this

[RA 8293 §176](https://en.wikipedia.org/wiki/Wikipedia:Philippines_copyright_law) removes copyright
from works of the Philippine Government. Exploiting one for profit normally needs prior agency
approval, **but the section carves out an exception**:

> "No prior approval or conditions shall be required for the use **for any purpose** of statutes,
> rules and regulations..."

Every rule here comes from a statute or an agency circular, so all of it sits inside that carve-out:
no approval, no royalties, any purpose. This is a reading of the statute, not legal advice.

**This matters when adding a source.** A statistical series is a different animal: PSA data is
CC BY 4.0 and fine, but other agencies assert rights over their publications and would need approval.
Check before adding anything that is not a circular or a statute.

## Obsidian vault

Durable project knowledge lives in the vault via the `obsidian` MCP server (`.mcp.json` at the repo
root). Vault: **`Ren`** (`/Users/ict/Documents/Ren`), folder **`Personal Projects/PH Payroll/`**.

The key comes from `${OBSIDIAN_API_KEY}`, never inlined. Supply it in `.claude/settings.local.json`
(gitignored) or export it in your shell.

**Prerequisite, currently NOT met.** Obsidian must be running with the Local REST API plugin
actually serving on `127.0.0.1:27124`. Verified 2026-09-15: nothing is listening, so calls fail with
`Connection refused`. Check with:

```bash
lsof -nP -iTCP:27124 -sTCP:LISTEN
```

If it is not listening, **say so plainly, put the note content inline in the reply so it is not
lost, and carry on**. No retry loops, no silent skipping, and never claim a note was written.

What belongs in the vault here: each circular as it is sourced (number, signing date, effective
date, what it repealed), the reasoning behind a bracket interpretation, and the licensing research
under §176. Not the code, which git already records.

## Agents and skills

`.claude/` is **gitignored**, so a fresh clone has none of it. Consequence worth naming: the vault
is the only durable record of *why* a rule is encoded the way it is. Write the reasoning down there,
not only in a comment.
