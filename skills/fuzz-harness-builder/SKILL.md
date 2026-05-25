---
name: fuzz-harness-builder
description: Use when creating, adapting, reviewing, or debugging JS/TS fuzzers, corpus fixtures, replay files, shrinkers, repro writers, or deterministic random test harnesses.
---

# Fuzz Harness Builder

Fuzzers should produce useful failures, not just random load.

## Required Properties

- Deterministic seed: `--seed`.
- Bounded run size: `--cases`, and domain-specific caps where needed.
- Replayable failure: `--replay` or `--write-repro`.
- Stable oracle: compare against an invariant, reference implementation, round trip, or replay result.
- Corpus promotion path: failures become checked-in fixture cases.
- Source traceability: corpus ideas from external projects cite the source-pass note or fetch manifest.

## Workflow

1. Identify the contract: roundtrip, immutability, convergence, idempotence, parse/print stability, or invalid-input behavior.
2. Generate valid values first, then mutate them. Prefer semantic operation streams when raw random input misses important states.
3. Add or adapt a template:

```sh
npx evidence-kit add-fuzzer --name core --language js
```

4. Replace `runSubject()` with the project API under test.
5. On failure, write a reduced JSON repro and add it to the corpus.
6. When fuzzing ideas come from external sources, run `npm run research:list` and cite the matching source note.

## Oracles To Prefer

- `decode(encode(value))` equals `value`.
- `apply(before, diff(before, after))` equals `after`.
- `optimized(program)` evaluates like `program`.
- duplicate message/update is idempotent.
- partition/drop/duplicate/heal schedule converges.

## Reporting

Final reports should include command, seed, cases, any replay path, and whether corpus fixtures were added.
