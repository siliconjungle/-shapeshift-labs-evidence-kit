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
let executed = 0;

for (const seedCase of corpus.cases || []) {
  runCase(seedCase, 'corpus:' + seedCase.name);
}

for (let i = 0; i < cases; i++) {
  const fuzzCase = buildGeneratedCase(i, rng);
  if (fuzzCase === null) break;
  runCase(fuzzCase, 'generated:' + i);
}

if (executed === 0) {
  console.log('{{name}} fuzz placeholder: add target-owned corpus cases or implement buildGeneratedCase()');
} else {
  console.log('{{name}} fuzz passed executed=' + executed + ' requested=' + cases + ' seed=' + seed);
}

function runCase(testCase, id) {
  try {
    const actual = runSubject(testCase.input);
    assert.deepStrictEqual(actual, testCase.expected, 'case mismatch ' + id);
    executed++;
  } catch (error) {
    if (args.writeRepro) writeRepro(args.writeRepro, testCase, id, error);
    throw error;
  }
}

function runSubject(input) {
  // Replace this adapter with the project API under test.
  return input;
}

function buildGeneratedCase(index, rng) {
  // Replace this with target-owned generation once the project contract is known.
  void index;
  void rng;
  return null;
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
