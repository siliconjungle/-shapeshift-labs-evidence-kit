#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  addBenchmark,
  addFuzzer,
  addResearchFetcher,
  buildPerfWiki,
  computeBenchmarkScope,
  fetchResearch,
  initEvidenceHarness,
  inspectProject,
  readResearchRegistry,
  searchPerfWiki
} from './index.mjs';

const rawArgv = process.argv.slice(2);
const args = parseArgs(rawArgv);
const command = args._[0] || 'help';
const cwd = path.resolve(args.cwd || process.cwd());

try {
  if (command === 'inspect') {
    const report = inspectProject(cwd);
    print(report, args.json);
  } else if (command === 'init') {
    const report = initEvidenceHarness(cwd, args);
    print(report, args.json);
  } else if (command === 'add-fuzzer') {
    const report = addFuzzer(cwd, args);
    print(report, args.json);
  } else if (command === 'add-benchmark') {
    const report = addBenchmark(cwd, args);
    print(report, args.json);
  } else if (command === 'add-source-fetcher') {
    const report = addResearchFetcher(cwd, args);
    print(report, args.json);
  } else if (command === 'scope') {
    const report = computeBenchmarkScope(cwd);
    if (args.update) {
      const outPath = path.join(cwd, 'benchmarks/results/benchmark-scope-latest.json');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    }
    print(report, args.json);
  } else if (command === 'docs') {
    const report = buildPerfWiki(cwd, { check: args.check });
    print(report, args.json);
  } else if (command === 'search' || command === 'docs:perf:search') {
    const report = searchPerfWiki(cwd, args._.slice(1), { limit: args.limit });
    printSearch(report, args.json);
  } else if (command === 'research:list') {
    const report = readResearchRegistry(cwd);
    printResearchRegistry(report, args.json);
  } else if (command === 'research:fetch') {
    const name = args._[1];
    if (!name) throw new Error('missing research source name');
    const report = fetchResearch(cwd, name, readRestAfter(rawArgv, name));
    if (report.status !== 0) process.exit(report.status);
  } else if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else {
    throw new Error('unknown command: ' + command);
  }
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value && value.created) {
    console.log('created: ' + (value.created.length ? value.created.join(', ') : 'none'));
    if (value.updated && value.updated.length) console.log('updated: ' + value.updated.join(', '));
    if (value.dryRun) console.log('dry-run: no files written');
    return;
  }
  if (value && value.groups) {
    console.log('benchmark scope node=' + value.node);
    for (const [name, group] of Object.entries(value.groups)) {
      console.log(`${name}: files=${group.files.length} hash=${group.hash.slice(0, 12)}`);
    }
    return;
  }
  if (value && value.packageName !== undefined) {
    console.log('project: ' + (value.packageName || path.basename(value.rootDir)));
    console.log('language: ' + value.language);
    console.log('package manager: ' + value.packageManager);
    console.log('files: ' + value.fileCount);
    console.log('evidence: ' + Object.entries(value.evidence).filter(([, present]) => present).map(([name]) => name).join(', '));
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function printResearchRegistry(registry, json) {
  if (json) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }
  console.log('Research registry');
  console.log('Name                          Fetch script                         Notes');
  console.log('----------------------------  -----------------------------------  -----');
  for (const entry of registry) {
    console.log(pad(entry.name, 28) + '  ' + pad(entry.npmScript || entry.fetchScript || '-', 35) + '  ' + (entry.notePaths.length ? entry.notePaths.join(', ') : '-'));
  }
}

function printSearch(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('Evidence search: ' + (report.query.length ? report.query.join(' ') : '(all)'));
  for (const result of report.results) {
    console.log(`[${result.kind}] ${result.verdict} score=${result.score} ${result.title}`);
    console.log('  ' + result.sourcePath);
    if (result.summary) console.log('  ' + result.summary);
    if (result.artifacts && result.artifacts.length) console.log('  artifacts: ' + result.artifacts.slice(0, 6).join(', '));
  }
  if (report.results.length === 0) console.log('No matching evidence.');
}

function printHelp() {
  console.log(`Usage:
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
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    if (key === 'json' || key === 'dry-run' || key === 'update' || key === 'check' || key === 'force') {
      out[toCamel(key)] = true;
    } else {
      out[toCamel(key)] = argv[++i];
    }
  }
  return out;
}

function readRestAfter(argv, value) {
  const index = argv.indexOf(value);
  return index === -1 ? [] : argv.slice(index + 1);
}

function pad(value, width) {
  const text = String(value || '');
  return text.length >= width ? text.slice(0, width - 1) + ' ' : text + ' '.repeat(width - text.length);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
