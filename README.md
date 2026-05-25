# ShapeShift Labs Evidence Kit

ShapeShift Labs Evidence Kit is a full-complexity JS/TS repository template for agent-operable tests, fuzzing, benchmarks, package-boundary gates, startup checks, benchmark scope, and decision records.

It is designed for AI coding agents and maintainers who want every target repository to answer:

- What external sources were fetched, where were they cached, and which commit/artifact was inspected?
- What target-owned contracts define correctness?
- Which fuzzers exercise those contracts?
- Which benchmarks justify performance claims?
- Which failures became replayable corpus cases?
- Which ideas were accepted, rejected, or deferred?

## Install

```sh
npm install -D @shapeshift-labs/evidence-kit
npx evidence-kit inspect
npx evidence-kit init
```

For local development from this repository:

```sh
node src/cli.mjs inspect
node src/cli.mjs init --dry-run
```

## Commands

```sh
evidence-kit inspect [--json]
evidence-kit init [--language js|ts] [--dry-run]
evidence-kit add-fuzzer [--name core] [--language js|ts]
evidence-kit add-benchmark [--name core] [--language js|ts]
evidence-kit add-source-fetcher [--name source-pass]
evidence-kit scope [--json] [--update]
evidence-kit docs [--check]
evidence-kit search [terms...] [--json] [--limit 10]
evidence-kit research:list [--json]
evidence-kit research:fetch <name> [fetch args...]
```

`init` creates the full evidence harness by default:

- `test/fuzz/core-fuzz.mjs` or `.ts`
- `test/fixtures/corpus.json` with no pre-seeded cases
- `benchmarks/core-benchmark.mjs` or `.ts`
- `benchmarks/startup-import.mjs`
- `benchmarks/package-boundary-gates.mjs`
- `benchmarks/fetch-source-pass-research.mjs`
- `benchmarks/results/`
- `benchmarks/data/`
- `iterations/000-bootstrap-evidence.md`
- `research/evidence-source-map.md`
- `research/source-pass-sources.json`
- `research/repos/`
- `docs/perf/`
- package scripts for `test:evidence`, `fuzz`, `bench:evidence`, `bench:startup:check`, `bench:package:gates`, `bench:scope`, `docs:perf`, `docs:perf:search`, `research:list`, `research:fetch`, `research:source-pass:fetch`, and `evidence:full`

## Research Ingestion

The kit treats source mining as a repeatable pipeline, not as free-form note writing:

1. Configure sources in `research/<topic>-sources.json`.
2. Fetch them with `npm run research:fetch -- <topic>`.
3. Cache external repos under `research/repos/<topic>/` and datasets or metadata under `benchmarks/data/<topic>/`.
4. Write the fetch manifest to `research/repos/<topic>/manifest.json`.
5. Have the agent inspect the cache and write `research/*-sources.md` plus `iterations/*-source-pass.md`.
6. Convert accepted ideas into target-owned tests, fuzzers, corpus cases, benchmark fixtures, package-boundary gates, or budget changes.

Supported fetch source types are `git`, `url`, `npm`, `file`, and `inline`. The generated fetcher does not ship with project-specific URLs; each target repo owns its source list.

## Skills

The `skills/` directory contains Codex skills that teach an AI agent how to apply the toolkit:

- `evidence-bootstrap`
- `target-evidence-designer`
- `fuzz-harness-builder`
- `benchmark-guardian`
- `perf-wiki-builder`
- `package-boundary-guardian`
- `source-pass-harvester`

The skills keep judgment in instructions and deterministic work in scripts. Agents should load only the skill they need, then use the CLI to scaffold or validate project artifacts.

## Evidence Format

Benchmarks should write structured JSON rows:

```json
{
  "name": "core-benchmark",
  "generatedAt": "2026-05-25T00:00:00.000Z",
  "node": "v26.1.0",
  "rows": [
    {
      "category": "core",
      "fixture": "target-owned-fixture",
      "library": "project",
      "status": "ok",
      "medianUs": 12.3,
      "p95Us": 18.9,
      "ops": 1000
    }
  ]
}
```

Fuzzers should be seedable, replayable, and capable of writing repro fixtures. Failures should become corpus cases rather than one-off console output.

## Full Evidence Stack

Projects should start with all evidence surfaces present:

- **Research ingestion evidence**: repeatable source fetchers, source config, local cache, manifest, and source-pass notes.
- **Fuzz evidence**: seedable fuzzer scaffold, target-owned corpus, repro-writing path.
- **Benchmark evidence**: structured benchmark JSON under `benchmarks/results/*latest.json`.
- **Scope evidence**: file-hash based benchmark scope recommendations.
- **Perf wiki evidence**: searchable iteration/research notes, fetcher artifacts, and benchmark maps.
- **Boundary evidence**: startup/import, reachable bytes, `npm pack --dry-run`, export, and dependency-direction gates.
- **Full gate**: `npm run evidence:full`.

The package deliberately ships only mechanisms. Target projects must supply their own sources, contracts, corpus cases, and benchmark fixtures.
