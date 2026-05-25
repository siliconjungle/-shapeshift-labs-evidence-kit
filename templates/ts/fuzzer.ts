import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface CorpusCase {
  name: string;
  family?: string;
  tags?: string[];
  input: Json;
  expected: Json;
}

const args = parseArgs(process.argv.slice(2));
const cases = readInt(args.cases, 200);
const seed = readInt(args.seed, 0x5eed);
const corpusPath = path.resolve(args.corpus || 'test/fixtures/corpus.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8')) as { cases: CorpusCase[] };
const rng = mulberry32(seed);

for (const seedCase of corpus.cases || []) runCase(seedCase, 'corpus:' + seedCase.name);
for (let i = 0; i < cases; i++) {
  const seedCase = pick(corpus.cases || [], rng) || { name: 'generated', input: {}, expected: {} };
  runCase(mutateCase(seedCase, i, rng), 'generated:' + i);
}

console.log('{{name}} fuzz passed cases=' + cases + ' seed=' + seed);

function runCase(testCase: CorpusCase, id: string): void {
  try {
    assert.deepStrictEqual(runSubject(testCase.input), testCase.expected, 'case mismatch ' + id);
  } catch (error) {
    if (args.writeRepro) writeRepro(args.writeRepro, testCase, id, error);
    throw error;
  }
}

function runSubject(input: Json): Json {
  // Replace this adapter with the project API under test.
  return cloneJson(input);
}

function mutateCase(seedCase: CorpusCase, index: number, rng: () => number): CorpusCase {
  const input = cloneJson(seedCase.input);
  const expected = runSubject(input);
  if (input && typeof input === 'object' && !Array.isArray(input) && expected && typeof expected === 'object' && !Array.isArray(expected)) {
    input.__fuzzIndex = index;
    expected.__fuzzIndex = index;
  }
  if (Array.isArray(input) && Array.isArray(expected)) {
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

function writeRepro(outPath: string, testCase: CorpusCase, id: string, error: unknown): void {
  const resolved = path.resolve(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify({ id, error: String(error), case: testCase }, null, 2) + '\n');
}

function cloneJson<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pick<T>(items: T[], rng: () => number): T | null {
  return items.length === 0 ? null : items[Math.floor(rng() * items.length)] || null;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    out[key === 'write-repro' ? 'writeRepro' : key] = argv[++i] || 'true';
  }
  return out;
}

function readInt(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}
