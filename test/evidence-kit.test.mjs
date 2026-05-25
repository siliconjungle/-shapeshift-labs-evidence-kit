import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  addBenchmark,
  addFuzzer,
  addResearchFetcher,
  buildPerfWiki,
  computeBenchmarkScope,
  initEvidenceHarness,
  inspectProject,
  readResearchRegistry,
  searchPerfWiki
} from '../src/index.mjs';

test('initializes and runs a JS evidence harness', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-kit-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture-project',
    version: '0.0.0',
    type: 'module',
    scripts: {
      test: 'node --test'
    }
  }, null, 2) + '\n');

  const init = initEvidenceHarness(dir, { language: 'js' });
  assert.ok(init.created.includes('test/fuzz/core-fuzz.mjs'));
  assert.ok(init.created.includes('benchmarks/fetch-source-pass-research.mjs'));
  assert.ok(init.created.includes('research/source-pass-sources.json'));
  assert.ok(init.updated.includes('package.json scripts.fuzz'));
  assert.ok(init.updated.includes('package.json scripts.research:source-pass:fetch'));
  const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'test/fixtures/corpus.json'), 'utf8'));
  assert.deepEqual(corpus.cases, []);

  const inspected = inspectProject(dir);
  assert.equal(inspected.language, 'js');
  assert.equal(inspected.evidence.hasFuzzers, true);
  assert.equal(inspected.evidence.hasResearchFetchers, true);

  const registry = readResearchRegistry(dir);
  const sourcePass = registry.find((entry) => entry.name === 'source-pass');
  assert.ok(sourcePass);
  assert.equal(sourcePass.npmScript, 'research:source-pass:fetch');

  fs.writeFileSync(path.join(dir, 'research/source-pass-sources.json'), JSON.stringify({
    version: 1,
    topic: 'source-pass',
    sources: [
      {
        name: 'inline-source',
        type: 'inline',
        text: 'target-owned source material',
        fileName: 'inline-source.txt'
      }
    ]
  }, null, 2) + '\n');
  execFileSync(process.execPath, ['benchmarks/fetch-source-pass-research.mjs'], {
    cwd: dir,
    stdio: 'pipe'
  });
  assert.ok(fs.existsSync(path.join(dir, 'research/repos/source-pass/manifest.json')));
  assert.ok(fs.existsSync(path.join(dir, 'benchmarks/data/source-pass/inline-source.txt')));
  execFileSync(process.execPath, [
    'benchmarks/package-boundary-gates.mjs',
    '--check',
    '--out',
    'benchmarks/results/package-boundary-gates-latest.json'
  ], {
    cwd: dir,
    stdio: 'pipe'
  });

  execFileSync(process.execPath, ['test/fuzz/core-fuzz.mjs', '--cases', '3'], {
    cwd: dir,
    stdio: 'pipe'
  });
  execFileSync(process.execPath, [
    'benchmarks/core-benchmark.mjs',
    '--rounds',
    '2',
    '--iterations',
    '10',
    '--out',
    'benchmarks/results/core-latest.json'
  ], {
    cwd: dir,
    stdio: 'pipe'
  });

  const docs = buildPerfWiki(dir);
  assert.equal(docs.noteCount, 2);
  assert.doesNotThrow(() => buildPerfWiki(dir, { check: true }));
  const search = searchPerfWiki(dir, ['evidence']);
  assert.ok(search.results.length > 0);

  const scope = computeBenchmarkScope(dir);
  assert.ok(scope.groups.correctness.hash);
  assert.ok(scope.groups.performance.files.includes('benchmarks/core-benchmark.mjs'));
});

test('adds named fuzzer and benchmark without overwriting existing files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-kit-add-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture-add', type: 'module' }) + '\n');

  const fuzzer = addFuzzer(dir, { name: 'api', language: 'js' });
  const duplicateFuzzer = addFuzzer(dir, { name: 'api', language: 'js' });
  const benchmark = addBenchmark(dir, { name: 'api', language: 'js' });
  const fetcher = addResearchFetcher(dir, { name: 'api-patterns' });

  assert.equal(fuzzer.path, 'test/fuzz/api-fuzz.mjs');
  assert.equal(duplicateFuzzer.skipped, true);
  assert.equal(benchmark.path, 'benchmarks/api-benchmark.mjs');
  assert.deepEqual(fetcher.created, ['benchmarks/fetch-api-patterns-research.mjs', 'research/api-patterns-sources.json']);
});
