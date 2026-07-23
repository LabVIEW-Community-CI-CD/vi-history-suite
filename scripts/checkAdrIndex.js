#!/usr/bin/env node

'use strict';

/**
 * ADR infrastructure gate (issue #2028).
 *
 * Fails closed when the Architecture Decision Record set under
 * docs/architecture/adr/ drifts from its index or required structure. It checks:
 *   - the ADR index (README.md) and the ADR template exist;
 *   - every ADR-NNNN-*.md file appears in the index and vice versa;
 *   - the index title/status columns agree with each ADR file's heading title
 *     and header status;
 *   - ADR numbers are sequential from 0001 with no gaps or duplicates;
 *   - every ADR carries the required `# ADR-NNNN:` heading plus `- Status:` and
 *     `- Date:` fields and the Context/Decision/Consequences sections.
 *   - every Superseded/Deprecated ADR links forward to an existing successor
 *     ADR (and not to itself), so the decision graph has no dangling
 *     supersession.
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
const SYRS_FILE = path.join('docs', 'requirements', 'syrs.md');
const ALLOWED_STATUSES = ['Proposed', 'Accepted', 'Active', 'Superseded', 'Deprecated'];

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

  // Parse the index table so each ADR's declared title/status can be checked
  // against the ADR file itself. Rows look like:
  //   | [ADR-0001](./ADR-0001-slug.md) | Title | Status |
  const indexRows = new Map();
  for (const row of index.matchAll(/^\|\s*\[ADR-(\d{4})\][^|]*\|([^|]*)\|([^|]*)\|/gm)) {
    indexRows.set(row[1], { title: row[2].trim(), status: row[3].trim() });
  }

  const entries = deps
    .readdirSync(adrDir)
    .filter((name) => ADR_FILE_PATTERN.test(name))
    .sort();

  const numbers = [];
  const supersessionTargets = [];
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
    const headingMatch = new RegExp(`^# ADR-${match[1]}:\\s*(.+)$`, 'm').exec(body);
    if (!headingMatch) {
      violations.push(`ADR ${name} is missing a "# ADR-${match[1]}: <title>" heading.`);
    } else {
      // Index title must match the ADR heading title so the index stays a
      // faithful table of contents.
      const indexRow = indexRows.get(match[1]);
      const headingTitle = headingMatch[1].trim();
      if (indexRow && indexRow.title && indexRow.title !== headingTitle) {
        violations.push(
          `ADR ${name} index title "${indexRow.title}" does not match its heading title "${headingTitle}".`
        );
      }
    }
    if (!/^- Status:\s*\S/m.test(body)) {
      violations.push(`ADR ${name} is missing a "- Status:" field.`);
    } else {
      // Validate the FIRST (header) status only; large ADRs may embed later
      // status lines for sub-decisions.
      const status = /^- Status:\s*(\S+)/m.exec(body)[1];
      if (!ALLOWED_STATUSES.includes(status)) {
        violations.push(
          `ADR ${name} has an unknown status "${status}"; expected one of: ${ALLOWED_STATUSES.join(', ')}.`
        );
      }
      // Index status must agree with the ADR file's header status.
      const indexRow = indexRows.get(match[1]);
      if (indexRow && indexRow.status && indexRow.status !== status) {
        violations.push(
          `ADR ${name} index status "${indexRow.status}" does not match its header status "${status}".`
        );
      }
      // Supersession linkage: a Superseded/Deprecated ADR must link forward to
      // the ADR that replaces it (the index rule), and that successor must
      // exist and not be the ADR itself. A dangling supersession leaves the
      // decision graph broken.
      if (status === 'Superseded' || status === 'Deprecated') {
        const successors = [...body.matchAll(/(?:Superseded|Replaced|Deprecated)\s+by\s+\[?ADR-(\d{4})/gi)].map(
          (m) => m[1]
        );
        if (successors.length === 0) {
          violations.push(
            `ADR ${name} is ${status} but does not link forward to the ADR that replaces it (expected "Superseded by ADR-NNNN").`
          );
        } else {
          for (const successor of successors) {
            if (successor === match[1]) {
              violations.push(`ADR ${name} is ${status} but names itself (ADR-${successor}) as its successor.`);
            } else {
              supersessionTargets.push({ source: name, target: successor });
            }
          }
        }
      }
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

  // Supersession targets must resolve to an existing ADR number.
  for (const { source, target } of supersessionTargets) {
    if (!numbers.includes(Number.parseInt(target, 10))) {
      violations.push(`ADR ${source} names ADR-${target} as its successor, but no such ADR file exists.`);
    }
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
 *
 * It also fails closed when an ADR cites a VHS-SYS-REQ id that is not declared
 * in syrs.md, catching typos and stale system-requirement citations.
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

  // Reverse validation: an ADR must not cite a VHS-SYS-REQ id that is not
  // declared in syrs.md (catches typos and stale/retired system-requirement
  // citations), mirroring the SRS stale-citation check in auditAdrIndex.
  const syrsPath = path.join(repoRoot, SYRS_FILE);
  if (deps.existsSync(syrsPath)) {
    const declaredSyrs = new Set(deps.readFileSync(syrsPath).match(/VHS-SYS-REQ-\d+/g) ?? []);
    const undeclared = [...citedSyrs].filter((syrs) => !declaredSyrs.has(syrs)).sort();
    for (const syrs of undeclared) {
      violations.push(`ADR cites system requirement ${syrs} that does not exist in syrs.md.`);
    }
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

// Build a structured governance-state summary (consumed by the repo-truth
// read-model's ADR/governance domain, VHS-REQ-692). Pure over the existing
// audits; reports consistency plus the violation count without stdout-parsing.
function buildGovernanceState(repoRoot = process.cwd()) {
  const structure = auditAdrIndex(repoRoot);
  const syrs = auditSyrsCoverage(repoRoot);
  const violations = [...structure.violations, ...syrs.violations];
  return {
    consistent: violations.length === 0,
    violationCount: violations.length,
    violations
  };
}

if (require.main === module) {
  if (process.argv.slice(2).includes('--json')) {
    process.stdout.write(`${JSON.stringify(buildGovernanceState(), null, 2)}\n`);
    process.exitCode = 0;
  } else {
    process.exitCode = main();
  }
}

module.exports = { auditAdrIndex, auditSyrsCoverage, buildGovernanceState, main, ADR_DIR };
