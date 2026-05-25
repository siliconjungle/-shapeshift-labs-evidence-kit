---
name: domain-evidence-designer
description: Use when adapting ShapeShift Labs Evidence Kit to a specific JS/TS project by creating domain-specific source lists, correctness invariants, seed corpus cases, fuzz generators, benchmark fixtures, source-pass plans, or evidence acceptance criteria.
---

# Domain Evidence Designer

Use this skill after the generic evidence harness exists. The goal is to make the harness speak the target project's domain instead of leaving placeholder roundtrips and empty source lists.

## Workflow

1. Inspect the repo contract:

```sh
npx evidence-kit inspect --json
npm run docs:perf:search -- domain invariant benchmark fuzz
npm run research:list
```

Read public exports, README/API docs, existing tests, bug fixtures, benchmark scripts, and package boundaries. Do not invent a contract that source or docs do not support.

2. Classify the project surface:

- library/API utility,
- codec/serializer,
- parser/compiler/transformer,
- state/cache/sync/CRDT/event log,
- UI/runtime/tooling,
- network/API client.

If more than one applies, split evidence by surface rather than forcing one category.

3. Create a domain evidence plan with five concrete outputs:

- `research/<topic>-sources.json`: primary sources to fetch.
- `research/<topic>-sources.md`: what was inspected and transferred.
- `test/fixtures/corpus.json` or a domain fixture file: seed cases and known failures.
- `test/fuzz/*`: semantic generator plus stable oracle.
- `benchmarks/*`: fixtures for hot paths, startup/import, and boundary-sensitive workloads.

4. Add or update a repeatable fetcher:

```sh
npx evidence-kit add-source-fetcher --name <topic>
npm run research:fetch -- <topic>
```

Use `git`, `url`, `npm`, `file`, or `inline` source entries. Prefer official repos/docs, specs, bug corpora, release artifacts, benchmark suites, and production-style traces. Record URL, commit/hash, local path, and why each source exists.

5. Convert domain contracts into invariants before writing random generators. Good invariants are executable and falsifiable:

- roundtrip or parse-print-parse,
- apply/replay reaches expected state,
- duplicate/out-of-order operations are safe by contract,
- invalid input fails predictably,
- public import does not pull optional/heavy modules,
- optimization preserves semantics,
- persistence/snapshot restores observable state.

6. Promote corpus seeds deliberately:

- one smoke case,
- one boundary case for each public contract,
- one malformed/adversarial case,
- one previously fixed regression if available,
- one scale-shaped case that is small enough for CI but represents the real workload.

7. Design benchmark fixtures from claims the project will make. Each benchmark row needs a category, fixture, metric, status, and output path under `benchmarks/results/*latest.json`. Keep bad-result, unsupported, timeout, and over-budget rows visible.

8. Run focused verification:

```sh
npm run test:evidence
npm run fuzz
npm run bench:evidence
npm run bench:startup:check
npm run bench:package:gates
npm run docs:perf
npm run docs:perf:search -- <topic>
```

## Reference

For compact patterns by project type, read `references/domain-patterns.md`.

## Rules

- Do not stop at a prose plan when a small executable fixture can be added.
- Do not use external source names as local benchmark names unless the benchmark actually measures that source.
- Do not add runtime dependencies from source mining without benchmark and boundary evidence.
- Keep generated corpora small, readable, and replayable; cache large source material under ignored paths.
- Record rejected ideas with reasons, not silence.
