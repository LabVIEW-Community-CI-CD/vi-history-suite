#!/usr/bin/env node

'use strict';

/**
 * ADR infrastructure gate (issue #2028).
 *
 * Fails closed when the Architecture Decision Record set under
 * docs/architecture/adr/ drifts from its index or required structure. It checks:
 *   - the ADR index (README.md) and the ADR template exist;
 *   - every ADR-NNNN-*.md file appears in the index and vice versa;
 *   - ADR numbers are sequential from 0001 with no gaps or duplicates;
 *   - every ADR carries the required `# ADR-NNNN:` heading plus `- Status:` and
 *     `- Date:` fields and the Context/Decision/Consequences sections.
 *
 * Pure over an injected filesystem so it is unit-testable, with a thin CLI that
 * exits non-zero on any violation. Wired to `npm run adr:check` and the
 * pre-push git hook.
 */

const fs = require('node:fs');
const path = require('node:path');

const ADR_DIR = path.join('docs', 'architecture', 'adr');
const INDEX_FILE = 'README.md';
const TEMPLATE_FILE = 'ADR-template.md';
const ADR_FILE_PATTERN = /^ADR-(\d{4})-[a-z0-9-]+\.md$/;
const REQUIRED_SECTIONS = ['## Context', '## Decision', '## Consequences'];
const RTM_FILE = path.join('docs', 'requirements', 'rtm.csv');

function defaultDeps() {
  return {
    readdirSync: (dir) => fs.readdirSync(dir),
    readFileSync: (file) => fs.readFileSync(file, 'utf8'),
    existsSync: (file) => fs.existsSync(file)
  };
}

/**
 * Audits the ADR set rooted at `repoRoot`. Returns { ok, violations: string[] }.
 * All filesystem access is injected via `deps` for testability.
 */
function auditAdrIndex(repoRoot, deps = defaultDeps()) {
  const violations = [];
  const adrDir = path.join(repoRoot, ADR_DIR);
  const indexPath = path.join(adrDir, INDEX_FILE);
  const templatePath = path.join(adrDir, TEMPLATE_FILE);

  if (!deps.existsSync(templatePath)) {
    violations.push(`Missing ADR template: ${path.join(ADR_DIR, TEMPLATE_FILE)}`);
  }
  if (!deps.existsSync(indexPath)) {
    violations.push(`Missing ADR index: ${path.join(ADR_DIR, INDEX_FILE)}`);
    return { ok: false, violations };
  }

  const index = deps.readFileSync(indexPath);

  const entries = deps
    .readdirSync(adrDir)
    .filter((name) => ADR_FILE_PATTERN.test(name))
    .sort();

  const numbers = [];
  for (const name of entries) {
    const match = ADR_FILE_PATTERN.exec(name);
    const number = Number.parseInt(match[1], 10);
    numbers.push(number);

    // Every ADR file must be linked from the index.
    if (!index.includes(name)) {
      violations.push(`ADR file not listed in ${INDEX_FILE}: ${name}`);
    }

    // Structural checks on the ADR body.
    const body = deps.readFileSync(path.join(adrDir, name));
    if (!new RegExp(`^# ADR-${match[1]}:`, 'm').test(body)) {
      violations.push(`ADR ${name} is missing a "# ADR-${match[1]}: <title>" heading.`);
    }
    if (!/^- Status:\s*\S/m.test(body)) {
      violations.push(`ADR ${name} is missing a "- Status:" field.`);
    }
    if (!/^- Date:\s*\S/m.test(body)) {
      violations.push(`ADR ${name} is missing a "- Date:" field.`);
    }
    for (const section of REQUIRED_SECTIONS) {
      if (!body.includes(section)) {
        violations.push(`ADR ${name} is missing the "${section}" section.`);
      }
    }

    // Requirement linkage: an ADR records a design decision, so it must cite at
    // least one SRS requirement (VHS-REQ-NNN) it is the design record for.
    if (!/VHS-REQ-\d+/.test(body)) {
      violations.push(
        `ADR ${name} does not cite an SRS requirement (VHS-REQ-NNN); an ADR must record the decision behind at least one software requirement.`
      );
    }
  }

  // The index must not reference ADR numbers that have no file.
  const indexedNumbers = [...index.matchAll(/ADR-(\d{4})/g)].map((m) => Number.parseInt(m[1], 10));
  for (const indexed of new Set(indexedNumbers)) {
    if (!numbers.includes(indexed)) {
      violations.push(`Index references ADR-${String(indexed).padStart(4, '0')} but no such ADR file exists.`);
    }
  }

  // Numbers must be sequential from 1 with no gaps or duplicates.
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i + 1) {
      violations.push(
        `ADR numbering is not sequential from 0001: expected ADR-${String(i + 1).padStart(4, '0')} but found ADR-${String(sorted[i]).padStart(4, '0')}.`
      );
      break;
    }
  }
  if (new Set(numbers).size !== numbers.length) {
    violations.push('Duplicate ADR numbers detected.');
  }
  if (numbers.length === 0) {
    violations.push('No ADR files found under docs/architecture/adr/.');
  }

  // Requirement coverage (restrictive): every Active VHS-REQ row in rtm.csv must
  // be linked into at least one ADR. An unlinked requirement means a shipped
  // capability whose architecture decision is not recorded, so it fails closed.
  const rtmPath = path.join(repoRoot, RTM_FILE);
  if (deps.existsSync(rtmPath)) {
    const adrCorpus = entries.map((name) => deps.readFileSync(path.join(adrDir, name))).join('\n');
    const citedReqs = new Set(adrCorpus.match(/VHS-REQ-\d+/g) ?? []);
    const rtm = deps.readFileSync(rtmPath).split(/\r?\n/);
    const activeReqs = new Set();
    const allReqs = new Set();
    const unlinked = [];
    for (const line of rtm) {
      const row = /^(VHS-REQ-\d+),[^,]*,(\w+),/.exec(line);
      if (!row) {
        continue;
      }
      allReqs.add(row[1]);
      if (row[2] === 'Active') {
        activeReqs.add(row[1]);
        if (!citedReqs.has(row[1])) {
          unlinked.push(row[1]);
        }
      }
    }
    if (unlinked.length > 0) {
      violations.push(
        `Active requirements not linked into any ADR (${unlinked.length}): ${unlinked.join(', ')}`
      );
    }
    // Reverse validation: an ADR must not cite a requirement id that is not an
    // Active row in rtm.csv (catches typos and stale/retired citations).
    const staleCitations = [...citedReqs]
      .filter((req) => !activeReqs.has(req))
      .sort();
    if (staleCitations.length > 0) {
      staleCitations.forEach((req) => {
        const reason = allReqs.has(req) ? 'is not Active' : 'does not exist';
        violations.push(`ADR cites requirement ${req} that ${reason} in rtm.csv.`);
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Dedicated SYRS-coverage audit (separate from the ADR structure/SRS-coverage
 * gate). Every system requirement (VHS-SYS-REQ-NNN) that parents at least one
 * Active SRS requirement in rtm.csv must be cited by at least one ADR, so no
 * shipped capability area exists whose system-level decision is unrecorded.
 *
 * The required SYRS set is DERIVED from the RTM's Active-SRS parents rather than
 * from the full syrs.md declaration, so purely structural system requirements
 * that have no Active SRS children (for example the requirement-split and
 * optional-expert-path system requirements) are not spuriously demanded.
 */
function auditSyrsCoverage(repoRoot, deps = defaultDeps()) {
  const violations = [];
  const adrDir = path.join(repoRoot, ADR_DIR);
  const rtmPath = path.join(repoRoot, RTM_FILE);
  if (!deps.existsSync(rtmPath)) {
    return { ok: true, violations };
  }

  const requiredSyrs = new Set();
  for (const line of deps.readFileSync(rtmPath).split(/\r?\n/)) {
    const match = /^VHS-REQ-\d+,(VHS-SYS-REQ-\d+),Active,/.exec(line);
    if (match) {
      requiredSyrs.add(match[1]);
    }
  }

  const adrFiles = deps.readdirSync(adrDir).filter((name) => ADR_FILE_PATTERN.test(name));
  const adrCorpus = adrFiles.map((name) => deps.readFileSync(path.join(adrDir, name))).join('\n');
  const citedSyrs = new Set(adrCorpus.match(/VHS-SYS-REQ-\d+/g) ?? []);

  const unlinked = [...requiredSyrs].filter((syrs) => !citedSyrs.has(syrs)).sort();
  if (unlinked.length > 0) {
    violations.push(
      `System requirements (SYRS) not cited by any ADR (${unlinked.length}): ${unlinked.join(', ')}`
    );
  }

  return { ok: violations.length === 0, violations };
}

function main(repoRoot = process.cwd()) {
  const structure = auditAdrIndex(repoRoot);
  const syrs = auditSyrsCoverage(repoRoot);
  const violations = [...structure.violations, ...syrs.violations];
  if (violations.length === 0) {
    process.stdout.write('[adr-check] ADR index, structure, SRS coverage, and SYRS coverage are consistent.\n');
    return 0;
  }
  process.stderr.write('[adr-check] ADR infrastructure check failed:\n');
  for (const violation of violations) {
    process.stderr.write(`  - ${violation}\n`);
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { auditAdrIndex, auditSyrsCoverage, ADR_DIR };
