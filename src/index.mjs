import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(__filename), '..');

export function inspectProject(rootDir = process.cwd()) {
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = readJsonIfExists(packageJsonPath);
  const files = listProjectFiles(rootDir);
  const scripts = packageJson && packageJson.scripts ? packageJson.scripts : {};
  const hasTsConfig = fs.existsSync(path.join(rootDir, 'tsconfig.json'));
  const packageManager = detectPackageManager(rootDir);
  const sourceDirs = ['src', 'lib', 'app', 'packages'].filter((dir) => fs.existsSync(path.join(rootDir, dir)));
  const testDirs = ['test', 'tests', '__tests__'].filter((dir) => fs.existsSync(path.join(rootDir, dir)));
  const benchmarkDirs = ['benchmarks', 'benchmark', 'perf'].filter((dir) => fs.existsSync(path.join(rootDir, dir)));
  const language = hasTsConfig || files.some((file) => file.endsWith('.ts') || file.endsWith('.tsx')) ? 'ts' : 'js';
  const moduleType = packageJson && packageJson.type === 'module' ? 'esm' : 'unknown';

  return {
    rootDir,
    packageName: packageJson ? packageJson.name || null : null,
    packageManager,
    language,
    moduleType,
    hasPackageJson: packageJson !== null,
    hasTsConfig,
    sourceDirs,
    testDirs,
    benchmarkDirs,
    scripts: {
      test: scripts.test || null,
      fuzz: scripts.fuzz || null,
      bench: scripts.bench || null,
      evidence: scripts['test:evidence'] || null,
      docsPerf: scripts['docs:perf'] || null,
      docsPerfSearch: scripts['docs:perf:search'] || null,
      researchList: scripts['research:list'] || null,
      researchFetch: scripts['research:fetch'] || null
    },
    fileCount: files.length,
    evidence: {
      hasFuzzers: files.some((file) => /(^|\/)fuzz\/|fuzz\.(mjs|js|ts)$|fuzz-/.test(file)),
      hasBenchmarks: benchmarkDirs.length > 0 || files.some((file) => file.startsWith('benchmarks/')),
      hasIterations: fs.existsSync(path.join(rootDir, 'iterations')),
      hasResearch: fs.existsSync(path.join(rootDir, 'research')),
      hasResearchFetchers: files.some((file) => /^benchmarks\/fetch-.+-research\.(?:mjs|js)$/.test(file)),
      hasSourceCache: fs.existsSync(path.join(rootDir, 'research', 'repos')) || fs.existsSync(path.join(rootDir, 'benchmarks', 'data')),
      hasPerfDocs: fs.existsSync(path.join(rootDir, 'docs', 'perf')),
      hasPerfIndex: fs.existsSync(path.join(rootDir, 'docs', 'perf', 'perf-wiki.json'))
    }
  };
}

export function initEvidenceHarness(rootDir = process.cwd(), options = {}) {
  const language = normalizeLanguage(options.language || inspectProject(rootDir).language);
  const dryRun = Boolean(options.dryRun);
  const created = [];
  const updated = [];

  const write = (relativePath, content) => {
    const absolutePath = path.join(rootDir, relativePath);
    if (fs.existsSync(absolutePath)) return;
    created.push(relativePath);
    if (dryRun) return;
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  };

  write('test/fixtures/corpus.json', JSON.stringify({
    version: 1,
    generatedBy: '@shapeshift-labs/evidence-kit',
    note: 'Target project must add corpus cases that exercise its own contracts.',
    cases: []
  }, null, 2) + '\n');

  const fuzzerPath = language === 'ts' ? 'test/fuzz/core-fuzz.ts' : 'test/fuzz/core-fuzz.mjs';
  const benchmarkPath = language === 'ts' ? 'benchmarks/core-benchmark.ts' : 'benchmarks/core-benchmark.mjs';
  write(fuzzerPath, renderBundledTemplate(language, 'fuzzer', { name: 'core' }));
  write(benchmarkPath, renderBundledTemplate(language, 'benchmark', { name: 'core' }));
  write('benchmarks/startup-import.mjs', renderTemplate('startup-import.mjs', { name: 'startup' }));
  write('benchmarks/package-boundary-gates.mjs', renderTemplate('package-boundary-gates.mjs', { name: 'package-boundary' }));
  write('benchmarks/fetch-source-pass-research.mjs', renderTemplate('fetch-research.mjs', { name: 'source-pass' }));
  write('iterations/000-bootstrap-evidence.md', renderTemplate('iteration-note.md', {
    title: 'Evidence Harness Bootstrap',
    date: new Date().toISOString().slice(0, 10)
  }));
  write('research/evidence-source-map.md', renderTemplate('research-note.md', {
    title: 'Evidence Source Map',
    date: new Date().toISOString().slice(0, 10)
  }));
  write('research/source-pass-sources.json', renderTemplate('source-sources.json', {
    name: 'source-pass'
  }));
  write('research/repos/.gitkeep', '');
  write('benchmarks/data/.gitkeep', '');
  write('docs/perf/.gitkeep', '');
  write('benchmarks/results/.gitkeep', '');

  const packageJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.scripts = packageJson.scripts || {};
    const additions = {
      'test:evidence': language === 'ts'
        ? 'echo "configure tsx/ts-node, then run test/fuzz/core-fuzz.ts" && node benchmarks/package-boundary-gates.mjs --check'
        : 'node test/fuzz/core-fuzz.mjs --cases 200 && node benchmarks/package-boundary-gates.mjs --check',
      fuzz: language === 'ts'
        ? 'echo "configure tsx/ts-node, then run test/fuzz/core-fuzz.ts"'
        : 'node test/fuzz/core-fuzz.mjs --cases 1000',
      'bench:evidence': language === 'ts'
        ? 'echo "configure tsx/ts-node, then run benchmarks/core-benchmark.ts" && node benchmarks/startup-import.mjs --check --out benchmarks/results/startup-import-latest.json'
        : 'node benchmarks/core-benchmark.mjs --out benchmarks/results/core-latest.json && node benchmarks/startup-import.mjs --check --out benchmarks/results/startup-import-latest.json',
      'bench:startup:check': 'node benchmarks/startup-import.mjs --check --out benchmarks/results/startup-import-latest.json',
      'bench:package:gates': 'node benchmarks/package-boundary-gates.mjs --check --out benchmarks/results/package-boundary-gates-latest.json',
      'bench:scope': 'evidence-kit scope',
      'docs:perf': 'evidence-kit docs',
      'docs:perf:search': 'evidence-kit search',
      'research:list': 'evidence-kit research:list',
      'research:fetch': 'evidence-kit research:fetch',
      'research:source-pass:fetch': 'node benchmarks/fetch-source-pass-research.mjs',
      'evidence:full': 'npm run test:evidence && npm run fuzz && npm run bench:evidence && npm run bench:startup:check && npm run bench:package:gates && npm run bench:scope -- --update && npm run docs:perf && npm run docs:perf -- --check'
    };
    for (const [name, value] of Object.entries(additions)) {
      if (typeof packageJson.scripts[name] !== 'string') {
        packageJson.scripts[name] = value;
        updated.push('package.json scripts.' + name);
      }
    }
    if (!dryRun && updated.length > 0) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    }
  }

  return { rootDir, language, dryRun, created, updated };
}

export function addFuzzer(rootDir = process.cwd(), options = {}) {
  const language = normalizeLanguage(options.language || inspectProject(rootDir).language);
  const name = sanitizeName(options.name || 'core');
  const relativePath = language === 'ts'
    ? `test/fuzz/${name}-fuzz.ts`
    : `test/fuzz/${name}-fuzz.mjs`;
  return writeGeneratedFile(rootDir, relativePath, renderBundledTemplate(language, 'fuzzer', { name }), options);
}

export function addBenchmark(rootDir = process.cwd(), options = {}) {
  const language = normalizeLanguage(options.language || inspectProject(rootDir).language);
  const name = sanitizeName(options.name || 'core');
  const relativePath = language === 'ts'
    ? `benchmarks/${name}-benchmark.ts`
    : `benchmarks/${name}-benchmark.mjs`;
  return writeGeneratedFile(rootDir, relativePath, renderBundledTemplate(language, 'benchmark', { name }), options);
}

export function addResearchFetcher(rootDir = process.cwd(), options = {}) {
  const name = sanitizeName(options.name || 'source-pass');
  const created = [];
  const skipped = [];
  const write = (relativePath, content) => {
    const absolutePath = path.join(rootDir, relativePath);
    if (fs.existsSync(absolutePath) && !options.force) {
      skipped.push(relativePath);
      return;
    }
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, content);
    }
    created.push(relativePath);
  };
  write(`benchmarks/fetch-${name}-research.mjs`, renderTemplate('fetch-research.mjs', { name }));
  write(`research/${name}-sources.json`, renderTemplate('source-sources.json', { name }));
  return { rootDir, name, dryRun: Boolean(options.dryRun), created, skipped };
}

export function computeBenchmarkScope(rootDir = process.cwd()) {
  const groups = [
    {
      name: 'correctness',
      description: 'Files that affect unit, integration, and fuzz correctness.',
      roots: ['src', 'lib', 'app', 'packages', 'test', 'tests']
    },
    {
      name: 'performance',
      description: 'Files that affect local benchmark behavior.',
      roots: ['src', 'lib', 'app', 'packages', 'benchmarks']
    },
    {
      name: 'evidence-docs',
      description: 'Evidence notes and generated perf documentation.',
      roots: ['iterations', 'research', 'docs/perf']
    },
    {
      name: 'package-shape',
      description: 'Package metadata, lockfiles, and TypeScript configuration.',
      roots: ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json']
    }
  ];
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    node: process.version,
    groups: Object.fromEntries(groups.map((group) => {
      const files = listExistingGroupFiles(rootDir, group.roots);
      return [group.name, {
        description: group.description,
        hash: hashFiles(rootDir, files),
        files
      }];
    }))
  };
}

export function buildPerfWiki(rootDir = process.cwd(), options = {}) {
  const notes = [
    ...readNotes(rootDir, 'iterations', 'iteration'),
    ...readNotes(rootDir, 'research', 'research')
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const benchmarkMap = readBenchmarkMap(rootDir);
  const generatedAt = options.check ? readExistingPerfGeneratedAt(rootDir) : new Date().toISOString();
  const payload = {
    version: 1,
    generatedAt,
    projectName: readProjectName(rootDir),
    noteCount: notes.length,
    benchmarkRowCount: benchmarkMap.rowCount,
    benchmarkFixtureCount: benchmarkMap.fixtures.length,
    notes,
    benchmarkMap,
    researchRegistry: readResearchRegistry(rootDir)
  };
  const json = JSON.stringify(payload, null, 2) + '\n';
  const html = renderPerfHtml(payload);
  const jsonPath = path.join(rootDir, 'docs/perf/perf-wiki.json');
  const htmlPath = path.join(rootDir, 'docs/perf/index.html');

  if (options.check) {
    assertFileEquals(jsonPath, json);
    assertFileEquals(htmlPath, html);
    return { checked: true, jsonPath, htmlPath, noteCount: notes.length };
  }

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(htmlPath, html);
  return { checked: false, jsonPath, htmlPath, noteCount: notes.length };
}

export function readResearchRegistry(rootDir = process.cwd()) {
  const packageJson = readJsonIfExists(path.join(rootDir, 'package.json')) || {};
  const entries = new Map();
  for (const [script, command] of Object.entries(packageJson.scripts || {})) {
    const match = /^research:(.+):fetch$/.exec(script);
    if (match === null) continue;
    const entry = ensureResearchEntry(entries, match[1]);
    entry.npmScript = script;
    entry.command = command;
    const scriptPath = readNodeFetchScriptPath(command);
    if (scriptPath) entry.fetchScript = scriptPath;
    addResearchAliases(entry, [match[1], scriptPath ? nameFromFetchScript(scriptPath) : null]);
  }
  for (const scriptPath of listResearchFetchScripts(rootDir)) {
    const entry = ensureResearchEntry(entries, nameFromFetchScript(scriptPath));
    if (!entry.fetchScript) entry.fetchScript = scriptPath;
    addResearchAliases(entry, [nameFromFetchScript(scriptPath)]);
  }
  for (const configPath of listResearchSourceConfigs(rootDir)) {
    const entry = ensureResearchEntry(entries, nameFromSourceConfig(configPath));
    entry.sourceConfigs.push(configPath);
    addResearchAliases(entry, [nameFromSourceConfig(configPath)]);
  }
  for (const notePath of listResearchNotes(rootDir)) {
    const entry = ensureResearchEntry(entries, nameFromResearchNote(notePath));
    entry.notePaths.push(notePath);
    addResearchAliases(entry, [nameFromResearchNote(notePath)]);
  }
  for (const manifestPath of listResearchManifests(rootDir)) {
    const topic = manifestPath.split('/').slice(-2, -1)[0] || nameFromResearchManifest(manifestPath);
    const entry = ensureResearchEntry(entries, topic);
    entry.manifestPaths.push(manifestPath);
    addResearchAliases(entry, [topic]);
  }
  return Array.from(entries.values())
    .map((entry) => ({
      ...entry,
      aliases: uniqueSorted(entry.aliases).filter((alias) => alias !== entry.name),
      notePaths: uniqueSorted(entry.notePaths),
      sourceConfigs: uniqueSorted(entry.sourceConfigs),
      manifestPaths: uniqueSorted(entry.manifestPaths)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function fetchResearch(rootDir = process.cwd(), name, fetchArgs = [], options = {}) {
  const entry = findResearchEntry(readResearchRegistry(rootDir), name);
  if (!entry) throw new Error('unknown research source: ' + name);
  if (!entry.npmScript && !entry.fetchScript) throw new Error('research source has no fetch script: ' + name);
  const result = entry.npmScript
    ? spawnSync('npm', ['run', entry.npmScript, '--', ...fetchArgs], { cwd: rootDir, stdio: options.stdio || 'inherit' })
    : spawnSync(process.execPath, [entry.fetchScript, ...fetchArgs], { cwd: rootDir, stdio: options.stdio || 'inherit' });
  if (result.error) throw result.error;
  return {
    name: entry.name,
    npmScript: entry.npmScript,
    fetchScript: entry.fetchScript,
    status: result.status === null ? 1 : result.status,
    signal: result.signal || null
  };
}

export function searchPerfWiki(rootDir = process.cwd(), terms = [], options = {}) {
  const payload = readPerfWikiPayload(rootDir);
  const query = normalizeSearchTerms(terms);
  const limit = readPositiveInt(options.limit, 10);
  const items = [
    ...payload.notes.map((note) => ({
      kind: note.kind,
      title: note.title,
      sourcePath: note.sourcePath,
      verdict: note.verdict,
      tags: note.tags || [],
      summary: note.summary || '',
      artifacts: note.artifacts || []
    })),
    ...(payload.researchRegistry || []).map((entry) => ({
      kind: 'research-source',
      title: entry.name,
      sourcePath: [...entry.sourceConfigs, ...entry.manifestPaths, entry.fetchScript || ''].filter(Boolean).join(', '),
      verdict: entry.manifestPaths.length > 0 ? 'measured' : 'reference',
      tags: ['research', 'source-pass'],
      summary: 'fetch=' + (entry.npmScript || entry.fetchScript || '-') + ' notes=' + entry.notePaths.length + ' manifests=' + entry.manifestPaths.length,
      artifacts: [...entry.notePaths, ...entry.sourceConfigs, ...entry.manifestPaths, entry.fetchScript || '', entry.npmScript || ''].filter(Boolean)
    })),
    ...payload.benchmarkMap.fixtures.map((fixture) => ({
      kind: 'benchmark',
      title: fixture.category + ' / ' + fixture.fixture,
      sourcePath: fixture.sources.join(', '),
      verdict: Object.keys(fixture.statuses || {}).some((status) => status !== 'ok') ? 'measured' : 'accepted',
      tags: ['benchmark', fixture.category],
      summary: 'rows=' + fixture.rows + ' statuses=' + Object.entries(fixture.statuses || {}).map(([status, count]) => status + ':' + count).join(', '),
      artifacts: fixture.sources
    }))
  ];
  const results = items
    .map((item) => ({ ...item, score: scoreSearchItem(item, query) }))
    .filter((item) => item.score > 0 && matchesSearchFilters(item, query))
    .sort((left, right) => right.score - left.score || left.sourcePath.localeCompare(right.sourcePath))
    .slice(0, limit);
  return {
    version: 1,
    generatedAt: payload.generatedAt,
    projectName: payload.projectName,
    query: query.rawTerms,
    results,
    benchmarkMap: payload.benchmarkMap
  };
}

export function packageRootDir() {
  return packageRoot;
}

function writeGeneratedFile(rootDir, relativePath, content, options = {}) {
  const absolutePath = path.join(rootDir, relativePath);
  if (fs.existsSync(absolutePath) && !options.force) {
    return { rootDir, path: relativePath, created: false, skipped: true };
  }
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return { rootDir, path: relativePath, created: !options.dryRun, skipped: false, dryRun: Boolean(options.dryRun) };
}

function renderBundledTemplate(language, kind, values) {
  const file = path.join(packageRoot, 'templates', language, `${kind}.${language === 'ts' ? 'ts' : 'mjs'}`);
  return interpolate(fs.readFileSync(file, 'utf8'), values);
}

function renderTemplate(fileName, values) {
  const file = path.join(packageRoot, 'templates', fileName);
  return interpolate(fs.readFileSync(file, 'utf8'), values);
}

function interpolate(input, values) {
  return input.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, key) => {
    if (values[key] === undefined) return '';
    return String(values[key]);
  });
}

function normalizeLanguage(value) {
  const language = String(value || 'js').toLowerCase();
  if (language === 'javascript') return 'js';
  if (language === 'typescript') return 'ts';
  if (language === 'js' || language === 'ts') return language;
  throw new Error('unsupported language: ' + value);
}

function sanitizeName(value) {
  const name = String(value || 'core').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return name || 'core';
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readPerfWikiPayload(rootDir) {
  const file = path.join(rootDir, 'docs/perf/perf-wiki.json');
  const existing = readJsonIfExists(file);
  if (existing && Array.isArray(existing.notes) && existing.benchmarkMap) return existing;
  const notes = [
    ...readNotes(rootDir, 'iterations', 'iteration'),
    ...readNotes(rootDir, 'research', 'research')
  ].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  const benchmarkMap = readBenchmarkMap(rootDir);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectName: readProjectName(rootDir),
    noteCount: notes.length,
    benchmarkRowCount: benchmarkMap.rowCount,
    benchmarkFixtureCount: benchmarkMap.fixtures.length,
    notes,
    benchmarkMap,
    researchRegistry: readResearchRegistry(rootDir)
  };
}

function ensureResearchEntry(entries, rawName) {
  const name = normalizeResearchName(rawName);
  let entry = entries.get(name);
  if (!entry) {
    entry = {
      name,
      aliases: [],
      npmScript: null,
      command: null,
      fetchScript: null,
      notePaths: [],
      sourceConfigs: [],
      manifestPaths: []
    };
    entries.set(name, entry);
  }
  addResearchAliases(entry, [rawName, name]);
  return entry;
}

function findResearchEntry(registry, rawName) {
  const name = normalizeResearchName(rawName);
  return registry.find((entry) => entry.name === name || entry.aliases.includes(name)) || null;
}

function readNodeFetchScriptPath(command) {
  const match = /\bnode\s+([^\s]+fetch-[^\s]+-research\.(?:mjs|js))\b/.exec(String(command || ''));
  return match === null ? null : match[1];
}

function listResearchFetchScripts(rootDir) {
  const dir = path.join(rootDir, 'benchmarks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => /^fetch-.+-research\.(?:mjs|js)$/.test(file))
    .map((file) => path.posix.join('benchmarks', file))
    .sort();
}

function listResearchSourceConfigs(rootDir) {
  const dir = path.join(rootDir, 'research');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => /^.+-sources\.json$/.test(file))
    .map((file) => path.posix.join('research', file))
    .sort();
}

function listResearchNotes(rootDir) {
  const dir = path.join(rootDir, 'research');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.posix.join('research', file))
    .sort();
}

function listResearchManifests(rootDir) {
  const dir = path.join(rootDir, 'research', 'repos');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join('research', 'repos', entry.name, 'manifest.json').replace(/\\/g, '/');
    if (fs.existsSync(path.join(rootDir, manifest))) out.push(manifest);
  }
  return out.sort();
}

function nameFromFetchScript(scriptPath) {
  return normalizeResearchName(path.basename(scriptPath).replace(/^fetch-/, '').replace(/-research\.(?:mjs|js)$/, ''));
}

function nameFromSourceConfig(configPath) {
  return normalizeResearchName(path.basename(configPath).replace(/\.json$/, ''));
}

function nameFromResearchNote(notePath) {
  return normalizeResearchName(path.basename(notePath).replace(/\.md$/, ''));
}

function nameFromResearchManifest(manifestPath) {
  return normalizeResearchName(path.basename(path.dirname(manifestPath)));
}

function normalizeResearchName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-sources$/, '')
    .replace(/-research$/, '')
    .replace(/^-|-$/g, '') || 'source-pass';
}

function addResearchAliases(entry, aliases) {
  for (const alias of aliases) {
    if (!alias) continue;
    const normalized = normalizeResearchName(alias);
    if (normalized) entry.aliases.push(normalized);
  }
}

function normalizeSearchTerms(terms) {
  const rawTerms = Array.isArray(terms) ? terms.map(String).filter(Boolean) : [];
  const filters = { kind: [], verdict: [], tag: [] };
  const required = [];
  const excluded = [];
  const optional = [];
  for (const term of rawTerms) {
    const match = /^(kind|verdict|tag|area):(.+)$/i.exec(term);
    if (match) {
      const key = match[1].toLowerCase() === 'area' ? 'tag' : match[1].toLowerCase();
      filters[key].push(match[2].toLowerCase());
      continue;
    }
    if (term.startsWith('+') && term.length > 1) required.push(term.slice(1).toLowerCase());
    else if ((term.startsWith('-') || term.startsWith('!')) && term.length > 1) excluded.push(term.slice(1).toLowerCase());
    else optional.push(term.toLowerCase());
  }
  return { rawTerms, filters, required, excluded, optional };
}

function scoreSearchItem(item, query) {
  const haystack = searchHaystack(item);
  if (query.rawTerms.length === 0) return 1;
  if (query.required.length === 0 && query.optional.length === 0 && query.excluded.length === 0) return 1;
  if (query.required.some((term) => !haystack.includes(term))) return 0;
  if (query.excluded.some((term) => haystack.includes(term))) return 0;
  let score = query.required.length * 4;
  for (const term of query.optional) {
    if (haystack.includes(term)) score += item.title.toLowerCase().includes(term) ? 4 : 1;
  }
  return score;
}

function matchesSearchFilters(item, query) {
  if (query.filters.kind.length > 0 && !query.filters.kind.includes(item.kind)) return false;
  if (query.filters.verdict.length > 0 && !query.filters.verdict.includes(item.verdict)) return false;
  if (query.filters.tag.length > 0 && !query.filters.tag.some((tag) => item.tags.includes(tag))) return false;
  return true;
}

function searchHaystack(item) {
  return [
    item.kind,
    item.title,
    item.sourcePath,
    item.verdict,
    item.summary,
    ...(item.tags || []),
    ...(item.artifacts || [])
  ].join(' ').toLowerCase();
}

function readProjectName(rootDir) {
  const packageJson = readJsonIfExists(path.join(rootDir, 'package.json'));
  return packageJson && packageJson.name ? packageJson.name : path.basename(rootDir);
}

function detectPackageManager(rootDir) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

function listProjectFiles(rootDir) {
  const out = [];
  walk(rootDir, '', out, {
    skipDirs: new Set(['.git', 'node_modules', 'dist', 'coverage', '.next', '.turbo'])
  });
  return out;
}

function walk(rootDir, relativeDir, out, options) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.gitkeep') continue;
    if (entry.isDirectory() && options.skipDirs.has(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(rootDir, relativePath, out, options);
    else if (entry.isFile()) out.push(relativePath);
  }
}

function listExistingGroupFiles(rootDir, roots) {
  const out = [];
  for (const root of roots) {
    const absolute = path.join(rootDir, root);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      out.push(root);
    } else if (stat.isDirectory()) {
      const files = [];
      walk(rootDir, root, files, { skipDirs: new Set(['node_modules', 'dist', 'coverage', 'results']) });
      out.push(...files);
    }
  }
  return Array.from(new Set(out)).sort();
}

function hashFiles(rootDir, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(rootDir, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function readPositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function readNotes(rootDir, relativeDir, kind) {
  const dir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const sourcePath = `${relativeDir}/${file}`;
      const raw = fs.readFileSync(path.join(rootDir, sourcePath), 'utf8');
      const frontmatter = parseFrontmatter(raw);
      const title = raw.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, '').replace(/[-_]/g, ' ');
      const verdict = frontmatter.verdict || raw.match(/\bverdict:\s*([a-z-]+)/i)?.[1] || inferVerdict(raw);
      return {
        kind,
        title,
        sourcePath,
        verdict,
        tags: readFrontmatterList(frontmatter.tags),
        decision: frontmatter.decision || '',
        summary: firstParagraph(raw),
        artifacts: extractArtifacts(raw)
      };
    });
}

function parseFrontmatter(raw) {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!field) continue;
    out[field[1]] = field[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function readFrontmatterList(value) {
  if (!value) return [];
  const text = String(value).trim();
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return text.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function firstParagraph(raw) {
  const body = raw
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/^#\s+.+$/m, '')
    .trim();
  const paragraph = body.split(/\n\s*\n/).find((part) => part.trim().length > 0) || '';
  return paragraph.replace(/\s+/g, ' ').slice(0, 240);
}

function inferVerdict(raw) {
  const lower = raw.toLowerCase();
  if (/\b(rejected|removed|discarded|regressed)\b/.test(lower)) return 'rejected';
  if (/\b(deferred|future work|open question|needs revisit)\b/.test(lower)) return 'needs-revisit';
  if (/\b(accepted|kept|implemented|passed|verified)\b/.test(lower)) return 'accepted';
  return 'logged';
}

function extractArtifacts(raw) {
  const paths = Array.from(raw.matchAll(/\b(?:src|test|tests|benchmarks|docs|research|iterations|packages)\/[A-Za-z0-9._/-]+/g)).map((match) => match[0]);
  const scripts = Array.from(raw.matchAll(/\b(?:test|fuzz|bench|docs|research):[A-Za-z0-9:_-]+/g)).map((match) => match[0]);
  return Array.from(new Set([...paths, ...scripts])).sort();
}

function readBenchmarkMap(rootDir) {
  const dir = path.join(rootDir, 'benchmarks', 'results');
  const fixtures = new Map();
  let rowCount = 0;
  if (!fs.existsSync(dir)) return { rowCount, fixtures: [] };
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name.includes('latest')).sort()) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      continue;
    }
    const rows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload.results) ? payload.results : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      rowCount++;
      const category = String(row.category || row.group || 'unknown');
      const fixture = String(row.fixture || row.name || row.task || 'unknown');
      const key = category + '\0' + fixture;
      const item = fixtures.get(key) || { category, fixture, rows: 0, sources: new Set(), statuses: {} };
      item.rows++;
      item.sources.add(`benchmarks/results/${file}`);
      const status = String(row.status || 'ok');
      item.statuses[status] = (item.statuses[status] || 0) + 1;
      fixtures.set(key, item);
    }
  }
  return {
    rowCount,
    fixtures: Array.from(fixtures.values()).map((item) => ({
      category: item.category,
      fixture: item.fixture,
      rows: item.rows,
      sources: Array.from(item.sources).sort(),
      statuses: item.statuses
    })).sort((left, right) => left.category.localeCompare(right.category) || left.fixture.localeCompare(right.fixture))
  };
}

function readExistingPerfGeneratedAt(rootDir) {
  const file = path.join(rootDir, 'docs/perf/perf-wiki.json');
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof payload.generatedAt === 'string') return payload.generatedAt;
  } catch {
    // Fall through to a deterministic placeholder so check reports missing/stale.
  }
  return 'check';
}

function renderPerfHtml(payload) {
  const noteItems = payload.notes.map((note) => `<li><strong>${escapeHtml(note.verdict)}</strong> ${escapeHtml(note.title)} <code>${escapeHtml(note.sourcePath)}</code></li>`).join('\n');
  const researchItems = (payload.researchRegistry || []).map((entry) => `<li>${escapeHtml(entry.name)} <code>${escapeHtml(entry.npmScript || entry.fetchScript || '-')}</code> manifests=${entry.manifestPaths.length}</li>`).join('\n');
  const fixtureItems = payload.benchmarkMap.fixtures.slice(0, 100).map((fixture) => `<li>${escapeHtml(fixture.category)} / ${escapeHtml(fixture.fixture)} rows=${fixture.rows}</li>`).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(payload.projectName)} Evidence</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; line-height: 1.45; color: #1f2937; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.projectName)} Evidence</h1>
  <p>Generated ${escapeHtml(payload.generatedAt)}. Notes: ${payload.noteCount}. Benchmark rows: ${payload.benchmarkRowCount}.</p>
  <h2>Notes</h2>
  <ul>${noteItems}</ul>
  <h2>Research Sources</h2>
  <ul>${researchItems}</ul>
  <h2>Benchmark Fixtures</h2>
  <ul>${fixtureItems}</ul>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assertFileEquals(filePath, expected) {
  let current;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error('missing generated file: ' + filePath);
  }
  if (current !== expected) throw new Error('generated file is stale: ' + filePath);
}
