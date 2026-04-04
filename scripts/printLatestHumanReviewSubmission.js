#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_ID = 'svelderrainruiz.vi-history-suite';
const LATEST_REVIEW_FILENAME = 'latest-human-review-submission.json';

function main() {
  const { repoRoot, json } = parseArgs(process.argv.slice(2));
  const latest = findLatestHumanReviewSubmission(repoRoot);
  if (!latest) {
    console.error('No retained human review submission metadata was discovered.');
    process.exitCode = 1;
    return;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(latest, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatLatestHumanReviewSubmission(latest));
}

function parseArgs(args) {
  const repoRoot = path.resolve(__dirname, '..');
  let json = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { repoRoot, json };
}

function findLatestHumanReviewSubmission(repoRoot) {
  const roots = collectSearchRoots(repoRoot);
  const candidates = [];
  for (const root of roots) {
    for (const filePath of findFilesNamed(root, LATEST_REVIEW_FILENAME)) {
      const parsed = tryReadJson(filePath);
      if (!parsed) {
        continue;
      }
      candidates.push({
        manifestPath: filePath,
        record: parsed,
        sortTimestamp: parseTimestamp(parsed.recordedAt, filePath)
      });
    }
  }
  if (candidates.length === 0) {
    return undefined;
  }
  candidates.sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  return candidates[0];
}

function collectSearchRoots(repoRoot) {
  const roots = new Set();
  roots.add(path.join(repoRoot, '.cache', 'harness-reports'));
  roots.add(path.join(repoRoot, '.vscode-test', 'user-data', 'User', 'workspaceStorage'));

  const home = os.homedir();
  if (home) {
    roots.add(path.join(home, '.config', 'Code', 'User', 'workspaceStorage'));
    roots.add(path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage'));
  }

  const windowsUsersRoot = path.join(path.sep, 'mnt', 'c', 'Users');
  if (fs.existsSync(windowsUsersRoot)) {
    for (const entry of safeReadDir(windowsUsersRoot)) {
      roots.add(
        path.join(
          windowsUsersRoot,
          entry,
          'AppData',
          'Roaming',
          'Code',
          'User',
          'workspaceStorage'
        )
      );
    }
  }

  return [...roots].filter((root) => fs.existsSync(root));
}

function findFilesNamed(root, filename) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        stack.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === filename) {
        if (
          entryPath.includes(`${path.sep}${EXTENSION_ID}${path.sep}`) ||
          entryPath.includes(`${path.sep}workspaceStorage${path.sep}`) ||
          entryPath.includes(`${path.sep}.cache${path.sep}harness-reports${path.sep}`)
        ) {
          results.push(entryPath);
        }
      }
    }
  }
  return results;
}

function tryReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function parseTimestamp(timestamp, fallbackPath) {
  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.parse(readStatTimestamp(fallbackPath));
}

function readStatTimestamp(filePath) {
  return fs.statSync(filePath).mtime.toISOString();
}

function safeReadDir(root) {
  try {
    return fs.readdirSync(root);
  } catch {
    return [];
  }
}

function formatLatestHumanReviewSubmission(candidate) {
  const lines = [
    `discovery: latest-manifest`,
    `recordedAt: ${candidate.record.recordedAt}`,
    `reviewer: ${candidate.record.reviewer?.name ?? 'unknown'}`,
    `outcome: ${candidate.record.reviewer?.outcome ?? 'unknown'}`,
    `confidence: ${candidate.record.reviewer?.confidence ?? 'unknown'}`,
    `machineFingerprintId: ${candidate.record.machine?.fingerprintId ?? 'unknown'}`,
    `canonicalRegistration: ${candidate.record.canonicalHostMachine?.registrationState ?? 'unknown'}`,
    `repository: ${candidate.record.target?.repositoryName ?? 'unknown'}`,
    `path: ${candidate.record.target?.relativePath ?? 'unknown'}`,
    `submission: ${candidate.record.artifactPaths?.submissionFilePath ?? candidate.manifestPath}`
  ];
  if (candidate.record.reviewer?.note) {
    lines.push(`note: ${candidate.record.reviewer.note}`);
  }
  return `${lines.join('\n')}\n`;
}

main();
