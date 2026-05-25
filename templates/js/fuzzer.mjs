import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../..');
const args = parseArgs(process.argv.slice(2));
const cases = readInt(args.cases, 200);
const seed = readInt(args.seed, 0x5eed);
const corpusPath = path.resolve(repoRoot, args.corpus || 'test/fixtures/corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const rng = mulberry32(seed);

for (const seedCase of corpus.cases || []) {
  runCase(seedCase, 'corpus:' + seedCase.name);
}

for (let i = 0; i < cases; i++) {
  const seedCase = pick(corpus.cases || [], rng) || { name: 'generated', input: {}, expected: {} };
  const fuzzCase = mutateCase(seedCase, i, rng);
  runCase(fuzzCase, 'generated:' + i);
}

console.log('{{name}} fuzz passed cases=' + cases + ' seed=' + seed);

function runCase(testCase, id) {
  try {
    const actual = runSubject(testCase.input);
    assert.deepStrictEqual(actual, testCase.expected, 'case mismatch ' + id);
  } catch (error) {
    if (args.writeRepro) writeRepro(args.writeRepro, testCase, id, error);
    throw error;
  }
}

function runSubject(input) {
  // Replace this adapter with the project API under test.
  return cloneJson(input);
}

function mutateCase(seedCase, index, rng) {
  const input = cloneJson(seedCase.input);
  const expected = runSubject(input);
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    input.__fuzzIndex = index;
    expected.__fuzzIndex = index;
  }
  if (Array.isArray(input)) {
    input.push(Math.floor(rng() * 1000));
    expected.push(input[input.length - 1]);
  }
  return {
    name: seedCase.name + ':mutated-' + index,
    family: seedCase.family || '{{name}}',
    tags: [...(seedCase.tags || []), 'mutated'],
    input,
    expected
  };
}

function writeRepro(outPath, testCase, id, error) {
  const resolved = path.resolve(repoRoot, outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify({
    id,
    error: error && error.stack ? error.stack : String(error),
    case: testCase
  }, null, 2) + '\n');
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function pick(items, rng) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(rng() * items.length)];
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'writeRepro' || key === 'write-repro') out.writeRepro = argv[++i];
    else out[key] = argv[++i] || true;
  }
  return out;
}

function readInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}
