import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = parseArgs(process.argv.slice(2));
const rounds = readInt(args.rounds, 7);
const iterations = readInt(args.iterations, 1000);
const samples: { elapsedMs: number; checksum: number }[] = [];

for (let round = 0; round < rounds; round++) {
  const start = performance.now();
  let checksum = 0;
  for (let i = 0; i < iterations; i++) checksum += runSubject({ value: i }).value;
  samples.push({ elapsedMs: performance.now() - start, checksum });
}

const timesUs = samples.map((sample) => (sample.elapsedMs * 1000) / iterations).sort((a, b) => a - b);
const payload = {
  name: '{{name}}-benchmark',
  generatedAt: new Date().toISOString(),
  node: process.version,
  rows: [{
    category: '{{name}}',
    fixture: '{{name}}-roundtrip',
    library: 'project',
    status: 'ok',
    medianUs: percentile(timesUs, 0.5),
    p95Us: percentile(timesUs, 0.95),
    ops: iterations,
    checksum: samples.reduce((sum, sample) => sum + sample.checksum, 0)
  }]
};

if (args.out) {
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
}

console.log(JSON.stringify(payload, null, 2));

function runSubject(input: { value: number }): { value: number } {
  // Replace this adapter with the project API under benchmark.
  return { value: input.value + 1 };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    out[arg.slice(2)] = argv[++i] || 'true';
  }
  return out;
}

function readInt(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
