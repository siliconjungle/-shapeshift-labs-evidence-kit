import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = parseArgs(process.argv.slice(2));
const rounds = readInt(args.rounds, 7);
const iterations = readInt(args.iterations, 1000);
const samples = [];

for (let round = 0; round < rounds; round++) {
  const start = performance.now();
  let checksum = 0;
  for (let i = 0; i < iterations; i++) {
    checksum += runSubject({ value: i }).value;
  }
  const elapsedMs = performance.now() - start;
  samples.push({ elapsedMs, checksum });
}

const timesUs = samples.map((sample) => (sample.elapsedMs * 1000) / iterations).sort((a, b) => a - b);
const row = {
  category: '{{name}}',
  fixture: '{{name}}-roundtrip',
  library: 'project',
  status: 'ok',
  medianUs: percentile(timesUs, 0.5),
  p95Us: percentile(timesUs, 0.95),
  ops: iterations,
  checksum: samples.reduce((sum, sample) => sum + sample.checksum, 0)
};
const payload = {
  name: '{{name}}-benchmark',
  generatedAt: new Date().toISOString(),
  node: process.version,
  rows: [row]
};

if (args.out) {
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
}

console.log(JSON.stringify(payload, null, 2));

function runSubject(input) {
  // Replace this adapter with the project API under benchmark.
  return { value: input.value + 1 };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    out[arg.slice(2)] = argv[++i] || true;
  }
  return out;
}

function readInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
