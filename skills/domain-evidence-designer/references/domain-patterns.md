# Domain Patterns

Use these as starting points. Replace them with evidence from the target project.

## Library Or API Utility

Sources: README/API docs, existing test fixtures, npm metadata for adjacent packages, issue regressions.

Invariants: public function contract, input immutability, invalid input behavior, stable exports, optional dependency isolation.

Corpus: minimal valid input, nested/large input, missing/extra fields, documented invalid input, regression case.

Benchmarks: hot public API, startup/import, reachable package bytes, repeated small operation, representative large operation.

## Codec Or Serializer

Sources: format specs, cross-language vectors, compression corpora, malformed fixtures, official codec repos.

Invariants: encode/decode roundtrip, canonical output stability, malformed input rejection, byte-size budget, resource caps.

Corpus: empty/minimal value, nested value, repeated strings/arrays, binary-like payload, malformed/truncated input.

Benchmarks: encode median/p95, decode median/p95, output bytes, frame inspect, history/batch decode.

## Parser, Compiler, Or Transformer

Sources: language specs, conformance tests, parser corpora, formatter fixtures, differential implementations.

Invariants: parse-print-parse, diagnostic stability, optimization equivalence, invalid syntax recovery, source-map/path stability.

Corpus: minimal program, deeply nested expression, comments/Unicode, invalid syntax, previous parser bug.

Benchmarks: parse, transform, print, diagnostic pass, large file, many small files.

## State, Cache, Sync, CRDT, Or Event Log

Sources: production traces, replication papers, local-first repos, database/cache tests, failure schedules.

Invariants: replay, idempotence, convergence, out-of-order delivery, snapshot restore, bounded change log.

Corpus: single update, conflicting updates, duplicate update, dropped/delayed schedule, large but bounded entity set.

Benchmarks: commit, route/dispatch, replay, snapshot persistence, query/watch notification, sync drain.

## UI Runtime Or Tooling

Sources: real interaction traces, accessibility fixtures, browser/runtime benchmarks, plugin ecosystems.

Invariants: deterministic model update, render state consistency, invalid command handling, serialization of user state, startup budget.

Corpus: minimal project, dense project, malformed config, undo/redo sequence, persisted session.

Benchmarks: startup, command dispatch, render/model projection, save/load, large project operation.

## Network Or API Client

Sources: protocol specs, OpenAPI schemas, official SDKs, recorded responses, retry/failure incidents.

Invariants: request shape, response decoding, retry idempotence, auth/header isolation, rate-limit/error handling.

Corpus: success response, partial response, error response, retryable failure, schema drift case.

Benchmarks: request encode, response decode, retry scheduling, pagination merge, cache update.
