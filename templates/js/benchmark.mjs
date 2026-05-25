import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const args = parseArgs(process.argv.slice(2));
const row = runBenchmark();
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

function runBenchmark() {
  // Replace this placeholder with target-owned work and metrics.
  void performance;
  return {
  category: '{{name}}',
  fixture: '{{name}}-placeholder',
  library: 'project',
  status: 'placeholder',
  note: 'Replace this row with a target-owned benchmark fixture before making performance claims.'
  };
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
