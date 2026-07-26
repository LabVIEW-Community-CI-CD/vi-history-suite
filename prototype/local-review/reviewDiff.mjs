#!/usr/bin/env node
// @ts-check
/**
 * Local pre-push code-review gate — PROTOTYPE.
 *
 * Emulates the GitHub Copilot PR reviewer BEFORE a push so the Copilot bot has
 * fewer/no comments to make. The actual review "engine" is an INJECTABLE seam
 * (`deps.review`) so the pure core is fully unit-testable without a live model.
 *
 * Two layers:
 *   1. PURE CORE (deterministic, no I/O): rubric, prompt builder, finding
 *      validation, threshold/blocking decision, report + human-summary shaping.
 *   2. IMPURE SHELL (CLI): git change-set collection (injectable runner) and a
 *      default reviewer stub that refuses to guess (it must be wired to a model,
 *      e.g. runSubagent — see DESIGN.md).
 *
 * @typedef {'blocker'|'warning'|'nit'} Severity
 * @typedef {{ file: string, line: number|null, severity: Severity, message: string, ruleId?: string }} Finding
 * @typedef {{ status: string, path: string }} ChangedFile
 * @typedef {{ diff: string, files: ChangedFile[] }} ChangeSet
 * @typedef {(prompt: string) => Promise<unknown[]>} ReviewFn
 * @typedef {(args: string[]) => Promise<string>} GitFn
 * @typedef {{ review?: ReviewFn, git?: GitFn }} Deps
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Typed errors — fail-closed, never fabricate.
// ---------------------------------------------------------------------------

/** Raised for any malformed input to the pure core. */
export class ReviewInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'ReviewInputError';
  }
}

// ---------------------------------------------------------------------------
// Constants.
// ---------------------------------------------------------------------------

export const REPORT_SCHEMA = 'vi-history-suite/local-review@v1';
export const SCHEMA_VERSION = 1;

/** Total order over severities; higher blocks lower. @type {Record<Severity, number>} */
export const SEVERITY_ORDER = Object.freeze({ nit: 0, warning: 1, blocker: 2 });

/** @type {readonly Severity[]} */
export const SEVERITIES = Object.freeze(['blocker', 'warning', 'nit']);

const SEVERITY_SET = new Set(SEVERITIES);

// ---------------------------------------------------------------------------
// RUBRIC — encoded as data. Derived from this repo's RECURRING Copilot findings.
// The prompt embeds this so the local reviewer looks for the same classes of
// issues the bot repeatedly raises. `defaultSeverity` is advisory guidance the
// reviewer may keep or override per finding.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RubricRule
 * @property {string} id           Stable rule id (cited back in Finding.ruleId).
 * @property {string} letter       The (a)-(h) label from the review brief.
 * @property {Severity} defaultSeverity
 * @property {string} title
 * @property {string} guidance     What to look for.
 * @property {string} antipattern  A concrete example of the violation.
 */

/** @type {readonly RubricRule[]} */
export const RUBRIC = Object.freeze([
  {
    id: 'fail-closed-input-validation',
    letter: 'a',
    defaultSeverity: 'blocker',
    title: 'Fail-closed input validation on pure models',
    guidance:
      'Pure/domain functions must reject malformed input with a thrown typed error (never coerce, default, or fabricate a plausible value). Validate at the boundary; do not silently accept null/undefined/NaN/wrong-typed fields.',
    antipattern:
      'A parser that returns a synthesized object for garbage input instead of throwing, or `value ?? fallback` masking a required-field violation.',
  },
  {
    id: 'comment-implementation-agreement',
    letter: 'b',
    defaultSeverity: 'warning',
    title: 'Comment / implementation agreement',
    guidance:
      'A doc comment, JSDoc, or name must not claim behavior the code does not implement. Flag any promise the implementation cannot keep.',
    antipattern:
      'A comment says "performs a UTC round-trip and normalizes offsets" but the code only calls Date.parse and returns the raw value.',
  },
  {
    id: 'iso8601-strict-parsing',
    letter: 'c',
    defaultSeverity: 'warning',
    title: 'Real ISO-8601 parsing + impossible-calendar rejection',
    guidance:
      'Date/time parsing must validate ISO-8601 shape AND reject impossible calendar dates (2026-02-30, month 13, hour 25). Date.parse / new Date(str) is too permissive and host-dependent — it accepts or rounds nonsense.',
    antipattern:
      'if (!Number.isNaN(Date.parse(s))) accept(s) — accepts "2026-13-40" on some engines and rolls it over on others.',
  },
  {
    id: 'side-effect-contract-tests',
    letter: 'd',
    defaultSeverity: 'warning',
    title: 'Tests assert side-effect contracts',
    guidance:
      'A test for code with side effects must assert the side-effect contract (e.g. before/after snapshots proving no repo pollution, no stray files, no unexpected writes), not just the return value.',
    antipattern:
      'A test runs an operation that writes to the working tree but never asserts the tree/index is unchanged afterward (no git-status before/after check).',
  },
  {
    id: 'sequential-external-tool-tests',
    letter: 'e',
    defaultSeverity: 'warning',
    title: 'Real external-tool tests run sequentially',
    guidance:
      'Tests that invoke a real external tool/runtime (LabVIEW, Docker, a shared daemon) must run SEQUENTIALLY, not via Promise.all/concurrent map — cold-start cost and shared mutable state make parallel invocations flaky.',
    antipattern:
      'await Promise.all(vis.map(v => renderWithRealRuntime(v))) — races the container cold-start / shared cache.',
  },
  {
    id: 'typed-result-unions-at-io',
    letter: 'f',
    defaultSeverity: 'warning',
    title: 'Typed result unions at I/O boundaries',
    guidance:
      'I/O boundaries (git, filesystem, network, child process) should return a typed result union ({ ok:true, value } | { ok:false, error }) instead of throwing raw errors for expected failure modes, so callers handle outcomes explicitly.',
    antipattern:
      'A boundary helper throws a bare Error for an expected "not found" case that every caller must try/catch, instead of returning a discriminated failure.',
  },
  {
    id: 'determinism-by-construction',
    letter: 'g',
    defaultSeverity: 'warning',
    title: 'Determinism by construction',
    guidance:
      'Outputs (ordering, ids, report shape) must be deterministic by construction — stable sorts, no reliance on object-key insertion order for semantics, no unseeded Date.now()/Math.random() in pure output paths.',
    antipattern:
      'Emitting findings in Map/Set iteration order, or sorting by a non-total comparator so equal elements reorder between runs.',
  },
  {
    id: 'additive-schema-evolution',
    letter: 'h',
    defaultSeverity: 'warning',
    title: 'Additive schema evolution vs breaking @v2',
    guidance:
      'Schema changes should be additive (new optional fields) under the same @v1 tag. A field removal, rename, or type change is breaking and requires a new @v2 tag plus a documented migration — do not silently mutate @v1.',
    antipattern:
      'Renaming report.summary.total to report.summary.count while keeping schema "@v1" — a breaking change hidden under an unchanged version tag.',
  },
]);

// ---------------------------------------------------------------------------
// LEARNED_RUBRIC — the ITERATIVE-STRICTNESS ledger. Every time the GitHub
// Copilot bot surfaces a finding on a PR that this local reviewer MISSED, distil
// the lesson into a rule here (with `source` provenance) and append it. The
// reviewer prompt embeds RUBRIC + LEARNED_RUBRIC, so the local gate gets
// monotonically stricter review-over-review and stops leaking the same class of
// issue to the bot twice. Keep entries specific and cite the PR/finding.
//
// letters use an `L` prefix so they never collide with the curated a–h base.
// ---------------------------------------------------------------------------

/**
 * @typedef {RubricRule & { source: string }} LearnedRule
 * A rubric rule distilled from a real Copilot finding. `source` names the PR and
 * the concrete symbol so the provenance of each strictness increment is auditable.
 */

/** @type {readonly LearnedRule[]} */
export const LEARNED_RUBRIC = Object.freeze([
  {
    id: 'return-the-normalized-value',
    letter: 'L1',
    defaultSeverity: 'warning',
    title: 'Return the normalized value, not the raw input',
    guidance:
      'A validator/sanitizer that computes a normalized form (trim, lowercase, canonical path/separator, dedupe) MUST return that normalized value. Validating the transformed form but returning the original input leaks un-normalized data downstream and quietly breaks dedupe / separator-normalization / determinism.',
    antipattern:
      'const trimmed = value.trim(); if (trimmed.length === 0) throw ...; return value; // returns the UN-trimmed original',
    source: 'Copilot PR #2352 — lvkitViScanModel.requireNonEmptyString returned the raw value after checking trimmed.length',
  },
  {
    id: 'doc-adjective-must-be-enforced',
    letter: 'L2',
    defaultSeverity: 'warning',
    title: 'A property claimed in a doc/name must be enforced by the code',
    guidance:
      'When a comment, JSDoc, or function name asserts a PROPERTY of the output (single-line, sorted, deduplicated, immutable, normalized, absolute-path, non-empty), the implementation must actually enforce it. This is a sharper specialization of comment/implementation-agreement: match every descriptive adjective to a concrete operation in the body.',
    antipattern:
      '/** ...single-line diagnostic message... */ function safeSlice(t){ return t.trim(); } // embedded \\n/\\t survive → multi-line output',
    source: 'Copilot PR #2352 — execFileText.safeSlice was documented "single-line" but only trimmed (kept embedded newlines/tabs)',
  },
  {
    id: 'disambiguate-multi-match-alias',
    letter: 'L3',
    defaultSeverity: 'warning',
    title: 'A loose alias/substring match must disambiguate when several inputs match',
    guidance:
      'When code maps inputs to a named output by a LOOSE match (substring/contains/prefix) and more than one input can match — especially once an expanded/"full" mode adds a second matching column/field — the mapping must disambiguate deterministically (match the specific variant, or define a stable tie-break). Never silently take the first match in incidental (header/column/iteration) order, and keep the name/comment consistent with the variant actually chosen.',
    antipattern:
      'path.includes("working set") → labviewWorkingSetMb, so both "Working Set" and "Working Set - Private" match and whichever column comes first in header order silently wins (total vs private flips with capture order).',
    source: 'Copilot PR #2356 — perfmon counterKeyFor mapped any "working set" counter to one named series; the full profile added a 2nd matching column, making the named series order-dependent (total vs private)',
  },
  {
    id: 'presence-check-is-not-a-type-check',
    letter: 'L4',
    defaultSeverity: 'warning',
    title: 'A presence check (!== undefined) is not a type check',
    guidance:
      'An OPTIONAL boundary input guarded only by presence (`!== undefined`, truthiness) but then passed into a helper that assumes a concrete type MUST also validate its type at the boundary. Otherwise an untyped caller passing null or a wrong-typed value gets a raw TypeError deep inside a helper instead of a clear fail-closed error — validate optional inputs the same way the required ones on the same function are validated.',
    antipattern:
      'if (req.name !== undefined) helper(req.name); // helper does name.trim() → passing null throws "Cannot read properties of null (reading \'trim\')" instead of a clear "name must be a string".',
    source: 'Copilot PR #2356 — buildWindowsPerfmonCapturePlan checked labviewProcessName !== undefined then called processName.trim(), throwing a raw TypeError on null/non-string untyped input',
  },
  {
    id: 'no-side-effects-in-array-predicate',
    letter: 'L5',
    defaultSeverity: 'warning',
    title: 'Keep Array.filter/map/some/every callbacks pure — no side effects',
    guidance:
      'A callback passed to Array.filter/map/some/every/reduce should be a pure predicate/transform. Mutating external state inside it (Set.add, .push, counter++, assignment) — often smuggled in with the comma operator to still return a boolean — is a readability/maintainability smell and easy to break on refactor. When you need to accumulate state (e.g. dedupe preserving first-seen order), use an explicit for-of loop instead.',
    antipattern:
      'const out = items.filter((x) => seen.has(x) ? false : (seen.add(x), true)); // side effect + comma operator inside a filter predicate',
    source: 'Copilot PR #2356 — buildWindowsPerfmonCapturePlan deduped counters with seenCounters.add() inside an Array.filter comma-operator predicate; refactored to an explicit loop',
  },
  {
    id: 'content-address-normalize-both-sides',
    letter: 'L6',
    defaultSeverity: 'warning',
    title: 'Content-addressed keys must be derived through the same normalization on write and read',
    guidance:
      'When a store is keyed by a content-addressed hash of caller-supplied fields (path + signature), the key MUST be computed from the SAME normalized form on BOTH put and get. Normalizing on only one side means a value written under one representation (e.g. a backslash-separator path) can never be retrieved by the normalized lookup, silently losing writes. Route both sides through one shared key-derivation helper so they cannot diverge.',
    antipattern:
      'put() computes key = hash(envelope.viPath) from the raw path while get() computes key = hash(toPosixRelativePath(viPath)); a backslash-separator write and a forward-slash lookup hash to different keys, so the read never finds the record.',
    source: 'Copilot PR #2361 — createFileLvkitViScanStore.put() hashed the raw envelope.viPath while get() hashed the POSIX-normalized path, so a Windows-separator write was unretrievable',
  },
  {
    id: 'structured-not-prose-tool-results',
    letter: 'L7',
    defaultSeverity: 'warning',
    title: 'Tool/agent results must be structured data on every path, including not-found and error',
    guidance:
      'A tool or endpoint consumed by a program or an agent must return STRUCTURED, machine-parseable output for EVERY outcome — including the not-found and error paths — not a free-text sentence. Return a typed object carrying a discriminant/status (and set the error flag where the transport supports it); do not emit a human prose string a caller cannot reliably parse. The unhappy paths deserve the same structured contract as the happy path.',
    antipattern:
      'return toolTextResult("No generated code found for " + viPath); — free prose on the not-found path, so an agent cannot machine-distinguish "not found" from a real payload or an error.',
    source: 'Copilot PR #2361 — renderGeneratedCodeResult returned a free-text not-found sentence instead of a structured {status:"not-found", ...} JSON object flagged as an error',
  },
  {
    id: 'construct-shared-resource-once',
    letter: 'L8',
    defaultSeverity: 'warning',
    title: 'Construct a shared per-server/session resource once in wiring, not per call',
    guidance:
      'A resource meant to be shared across requests (a store, cache, client, connection pool) must be constructed ONCE where dependencies are wired and captured by the handler closure — not re-created inside the per-call handler. Building it per call defeats any in-process caching/consistency it provides and can duplicate work or diverge state between calls.',
    antipattern:
      'getViGeneratedCode: (input) => getViGeneratedCode(input, createDefaultLvkitViScanStore()) — a new store is constructed on every call instead of once where deps are wired.',
    source: 'Copilot PR #2361 — the lvkit scan store was created inside the per-call getViGeneratedCode handler; moved to a single instance in buildViSemanticMcpServerDeps',
  },
  {
    id: 'read-guard-mirrors-builder-validation',
    letter: 'L9',
    defaultSeverity: 'warning',
    title: 'A fail-closed read guard must enforce the same invariants as the constructive builder',
    guidance:
      'When a persisted/deserialized value is re-validated by a fail-closed READ guard, that guard must enforce the SAME field invariants the constructive BUILDER enforces — non-BLANK (not merely present/non-empty), a real ISO-8601 instant (not merely a present string), enum membership, and count invariants. Prefer ONE shared exported validator used by both the builder and the guard so they cannot drift; a guard weaker than the builder admits tampered or corrupt records the builder would reject.',
    antipattern:
      'guard accepts typeof e.generatedAt === "string" && e.viPath.length > 0, admitting "   " and "not-a-date", while the builder required a trimmed non-blank string and a real ISO-8601 instant.',
    source: 'Copilot PR #2361 — isLvkitViScanEnvelope read guard accepted whitespace-only fields and a non-ISO generatedAt that the builder (requireNonEmptyString / requireIsoTimestamp) rejects; tightened via shared isNonBlankString / isIsoTimestamp',
  },
  {
    id: 'side-effect-only-on-real-work',
    letter: 'L10',
    defaultSeverity: 'warning',
    title: 'Fire a costly best-effort side effect only on real work, not on cache-hit/no-op successes',
    guidance:
      'A best-effort side effect (a scan, an index build, a lock-contending job) hung off a "success" branch must be suppressed when the success was a cache hit or a no-op that did no real work (e.g. result.cached === true). Firing it on every cache hit wastes a costly process and can contend for a shared runtime lock for nothing.',
    antipattern:
      'if (result.outcome === "rendered") fireScan(...) — fires the scan even when result.cached === true (a cache hit that ran no runtime), starting a costly lvkit process per cached open.',
    source: 'Codex PR #2362 — the preview-time scan fired on cache-hit renders; gated on result.cached !== true',
  },
  {
    id: 'best-effort-sink-must-report-outcome',
    letter: 'L11',
    defaultSeverity: 'warning',
    title: 'A best-effort sink that swallows errors must still report success/failure',
    guidance:
      'A sink that is best-effort (never throws) must still RETURN whether the write actually happened (a boolean or a result union) so the caller does not falsely report success. A caller that awaits a void best-effort put and then unconditionally returns "persisted"/"done" mislabels a silently-dropped write as a success, breaking any later read that depends on it.',
    antipattern:
      'await store.put(x); return { status: "persisted" }; — put swallows a disk-full/permission error and returns void, so the caller claims persisted for a write that never landed.',
    source: 'Codex PR #2362 — createFileLvkitViScanStore.put swallowed fs errors and returned void; changed to return boolean so the trigger reports store-write-failed instead of a false persisted',
  },
  {
    id: 'precise-parent-escape-check',
    letter: 'L12',
    defaultSeverity: 'warning',
    title: 'Detect a path escaping a root precisely, not by a bare ".." prefix',
    guidance:
      'To decide whether path.relative(root, target) escapes root, test relativePath === ".." || relativePath.startsWith(".." + path.sep) (plus path.isAbsolute for a different Windows drive). A bare relativePath.startsWith("..") over-rejects a valid in-root entry whose own basename merely begins with two dots (e.g. "..diagnostic.vi").',
    antipattern:
      'if (rel.startsWith("..")) continue; — drops a valid in-workspace file named "..diagnostic.vi" because its relative path begins with "..".',
    source: 'Codex PR #2362 — buildPreviewTimeViScanRequest rejected every ".."-prefixed relative path; narrowed to real parent escapes',
  },
  {
    id: 'guard-side-effect-callback',
    letter: 'L13',
    defaultSeverity: 'warning',
    title: 'Guard a fire-and-forget side-effect callback invoked on a critical path',
    guidance:
      'A fire-and-forget callback (an optional hook, an event notification) invoked on a critical host path — a UI resolve, a request handler, a render success — must be wrapped so a throw from the callback cannot fail the host path. The host operation must complete regardless of a faulty side-effect wiring.',
    antipattern:
      'this.onPreviewScanReady?.(path, runtime); — an unguarded optional callback on the preview resolve path; a throw from a mis-wired handler fails the whole preview.',
    source: 'Copilot PR #2362 — onPreviewScanReady was invoked without an exception guard on the preview resolve path; wrapped in try/catch',
  },
  {
    id: 'doc-must-track-outcome-cases',
    letter: 'L14',
    defaultSeverity: 'warning',
    title: 'Update an outcome/type doc when a new case or branch is added',
    guidance:
      'When a new outcome case or branch is added to a typed result (a new reason under an existing status, a new non-throwing failure path), update the type/outcome doc comment so callers interpret it correctly. A doc that enumerates when each status occurs becomes wrong the moment a new path returns that status for a different reason.',
    antipattern:
      'doc: "errored: the scan or store THREW" while the code now also returns errored for a non-throwing store-write-failed (put returned false).',
    source: 'Copilot PR #2362 — PreviewTimeViScanOutcome doc said errored only covers a throw after store-write-failed (non-throwing) was added under errored',
  },
  {
    id: 'purity-claim-must-track-imports',
    letter: 'L15',
    defaultSeverity: 'warning',
    title: 'Keep a module purity / no-I/O header in sync when I/O is added',
    guidance:
      'A module header that claims the module is "pure" / "performs no I/O" must be updated when I/O (node:fs/os/path use) or an I/O-wiring factory is added — scope the purity claim to the pure core and name the node-fs-backed factory. A stale purity claim misleads readers into assuming a boundary that no longer holds.',
    antipattern:
      'header: "Pure apart from node:crypto; performs no I/O of its own." on a module that now imports node:fs/os/path and defines createDefault...Store() wiring real fs.',
    source: 'Copilot PR #2362 — lvkitViScanStore.ts header still claimed no I/O after createDefaultLvkitViScanStore (node-fs) was moved into it; header scoped to the pure core',
  },
]);

/**
 * The active rubric the prompt enforces: the curated a–h base PLUS every learned
 * rule accumulated from real Copilot reviews. This is what buildReviewPrompt
 * embeds by default.
 * @type {readonly RubricRule[]}
 */
export const ACTIVE_RUBRIC = Object.freeze([...RUBRIC, ...LEARNED_RUBRIC]);

// ---------------------------------------------------------------------------
// PURE CORE.
// ---------------------------------------------------------------------------

/**
 * Parse `git diff --name-status` output into a stable, deduplicated file list.
 * Fail-closed: throws on non-string input.
 *
 * @param {string} nameStatusOutput
 * @returns {ChangedFile[]}
 */
export function parseNameStatus(nameStatusOutput) {
  if (typeof nameStatusOutput !== 'string') {
    throw new ReviewInputError(
      `parseNameStatus expected a string, received ${describe(nameStatusOutput)}`,
    );
  }
  /** @type {ChangedFile[]} */
  const files = [];
  for (const raw of nameStatusOutput.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue;
    const parts = line.split('\t').filter((p) => p !== '');
    if (parts.length < 2) continue; // malformed row — skip, do not fabricate
    const status = parts[0];
    // Renames/copies look like: R100 <old> <new>. The destination is last.
    const path = parts[parts.length - 1];
    files.push({ status, path });
  }
  // Determinism by construction: stable order regardless of git's output order.
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Build the review prompt = RUBRIC + change set. Pure string assembly.
 *
 * @param {ChangeSet} changeSet
 * @param {readonly RubricRule[]} [rubric]
 * @returns {string}
 */
export function buildReviewPrompt(changeSet, rubric = ACTIVE_RUBRIC) {
  const { diff, files } = assertChangeSet(changeSet);

  const rubricText = rubric
    .map(
      (r) =>
        `${r.letter}. [${r.id}] (default: ${r.defaultSeverity}) — ${r.title}\n` +
        `   LOOK FOR: ${r.guidance}\n` +
        `   ANTI-PATTERN: ${r.antipattern}` +
        (typeof r.source === 'string' && r.source.length > 0
          ? `\n   LEARNED FROM: ${r.source}`
          : ''),
    )
    .join('\n\n');

  const fileList =
    files.length === 0
      ? '(no changed files reported)'
      : files.map((f) => `- ${f.status}\t${f.path}`).join('\n');

  return [
    'You are a STRICT senior code reviewer emulating the GitHub Copilot PR reviewer.',
    'Review the change set below against the rubric. Your job is to surface issues',
    'BEFORE the code is pushed so the automated PR bot has nothing left to flag.',
    '',
    'OUTPUT CONTRACT (must obey exactly):',
    '- Return ONLY a JSON array of findings. No prose before/after.',
    '- Each finding: { "file": string, "line": integer|null, "severity": "blocker"|"warning"|"nit", "message": string, "ruleId": string }.',
    '- "file" must be a path from the CHANGED FILES list. "line" is the new-file line number or null.',
    '- "ruleId" should be one of the rubric ids when a rule applies (else a short slug).',
    '- Do NOT fabricate issues. If the change set is clean, return [].',
    '- Prefer the rubric\'s default severity unless the concrete case clearly warrants otherwise.',
    '',
    '## RUBRIC (recurring findings to enforce)',
    rubricText,
    '',
    '## CHANGED FILES',
    fileList,
    '',
    '## UNIFIED DIFF',
    diff.length === 0 ? '(empty diff)' : diff,
  ].join('\n');
}

/**
 * Validate + normalize a single raw finding. Fail-closed: throws a typed error
 * on anything malformed rather than coercing to a plausible value.
 *
 * @param {unknown} raw
 * @param {number} [index]
 * @returns {Finding}
 */
export function validateFinding(raw, index = 0) {
  const at = `finding[${index}]`;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ReviewInputError(`${at} must be a non-array object, received ${describe(raw)}`);
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);

  if (typeof obj.file !== 'string' || obj.file.trim() === '') {
    throw new ReviewInputError(`${at}.file must be a non-empty string`);
  }
  if (typeof obj.message !== 'string' || obj.message.trim() === '') {
    throw new ReviewInputError(`${at}.message must be a non-empty string`);
  }
  if (typeof obj.severity !== 'string' || !SEVERITY_SET.has(/** @type {Severity} */ (obj.severity))) {
    throw new ReviewInputError(
      `${at}.severity must be one of ${SEVERITIES.join('|')}, received ${describe(obj.severity)}`,
    );
  }
  /** @type {number|null} */
  let line = null;
  if (obj.line !== undefined && obj.line !== null) {
    if (typeof obj.line !== 'number' || !Number.isInteger(obj.line) || obj.line <= 0) {
      throw new ReviewInputError(
        `${at}.line must be a positive integer or null, received ${describe(obj.line)}`,
      );
    }
    line = obj.line;
  }

  /** @type {Finding} */
  const finding = {
    file: obj.file,
    line,
    severity: /** @type {Severity} */ (obj.severity),
    message: obj.message,
  };
  if (typeof obj.ruleId === 'string' && obj.ruleId.trim() !== '') {
    finding.ruleId = obj.ruleId;
  }
  return finding;
}

/**
 * Validate an array of raw findings. Fail-closed on the array itself and each item.
 *
 * @param {unknown} rawFindings
 * @returns {Finding[]}
 */
export function validateFindings(rawFindings) {
  if (!Array.isArray(rawFindings)) {
    throw new ReviewInputError(
      `reviewer must return an array of findings, received ${describe(rawFindings)}`,
    );
  }
  return rawFindings.map((f, i) => validateFinding(f, i));
}

/**
 * Deterministic ordering: severity desc, then file asc, then line asc, then message.
 *
 * @param {Finding[]} findings
 * @returns {Finding[]}
 */
export function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const sev = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sev !== 0) return sev;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    const la = a.line ?? Number.MAX_SAFE_INTEGER;
    const lb = b.line ?? Number.MAX_SAFE_INTEGER;
    if (la !== lb) return la - lb;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
}

/**
 * Decide whether the change set is blocked at a given threshold.
 * Fail-closed: throws on an unknown threshold.
 *
 * @param {Finding[]} findings
 * @param {Severity} [threshold]
 * @returns {{ blocking: boolean, blockingFindings: Finding[] }}
 */
export function decideBlocking(findings, threshold = 'warning') {
  if (!SEVERITY_SET.has(threshold)) {
    throw new ReviewInputError(
      `threshold must be one of ${SEVERITIES.join('|')}, received ${describe(threshold)}`,
    );
  }
  if (!Array.isArray(findings)) {
    throw new ReviewInputError(`findings must be an array, received ${describe(findings)}`);
  }
  const min = SEVERITY_ORDER[threshold];
  const blockingFindings = findings.filter((f) => SEVERITY_ORDER[f.severity] >= min);
  return { blocking: blockingFindings.length > 0, blockingFindings };
}

/**
 * Count findings by severity.
 *
 * @param {Finding[]} findings
 * @returns {{ blocker: number, warning: number, nit: number }}
 */
export function countBySeverity(findings) {
  const counts = { blocker: 0, warning: 0, nit: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/**
 * Build the schema-tagged report. Pure and deterministic.
 *
 * @param {{ findings: Finding[], threshold?: Severity }} args
 * @returns {{
 *   schema: string,
 *   schemaVersion: number,
 *   threshold: Severity,
 *   findings: Finding[],
 *   blocking: boolean,
 *   summary: {
 *     total: number, blockers: number, warnings: number, nits: number,
 *     blockingCount: number, threshold: Severity
 *   }
 * }}
 */
export function buildReport({ findings, threshold = 'warning' }) {
  if (!Array.isArray(findings)) {
    throw new ReviewInputError(`buildReport.findings must be an array, received ${describe(findings)}`);
  }
  const sorted = sortFindings(findings);
  const { blocking, blockingFindings } = decideBlocking(sorted, threshold);
  const counts = countBySeverity(sorted);
  return {
    schema: REPORT_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    threshold,
    findings: sorted,
    blocking,
    summary: {
      total: sorted.length,
      blockers: counts.blocker,
      warnings: counts.warning,
      nits: counts.nit,
      blockingCount: blockingFindings.length,
      threshold,
    },
  };
}

/**
 * Render a concise human summary of a report.
 *
 * @param {ReturnType<typeof buildReport>} report
 * @returns {string}
 */
export function formatHumanSummary(report) {
  const { summary, findings, blocking, threshold } = report;
  const verdict = blocking ? 'BLOCK ❌' : 'PASS ✅';
  const head =
    `Local review: ${verdict} — ${summary.total} finding(s) ` +
    `(${summary.blockers} blocker, ${summary.warnings} warning, ${summary.nits} nit) ` +
    `[threshold: ${threshold}, blocking: ${summary.blockingCount}]`;
  if (findings.length === 0) {
    return `${head}\n  (no findings — change set is clean)`;
  }
  const lines = findings.map((f) => {
    const loc = `${f.file}:${f.line ?? '?'}`;
    const rule = f.ruleId ? ` {${f.ruleId}}` : '';
    return `  [${f.severity.padEnd(7)}] ${loc}${rule} — ${f.message}`;
  });
  return [head, ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// ORCHESTRATION (still pure w.r.t. the injected reviewer).
// ---------------------------------------------------------------------------

/**
 * Core seam: build the prompt, hand it to the injected reviewer, validate the
 * result fail-closed. No I/O of its own — `deps.review` is the only side effect,
 * and it is injected (a fake in tests; a runSubagent-backed reviewer in prod).
 *
 * @param {ChangeSet} changeSet
 * @param {Deps} deps
 * @param {readonly RubricRule[]} [rubric]
 * @returns {Promise<Finding[]>}
 */
export async function reviewChangeSet(changeSet, deps, rubric = RUBRIC) {
  assertChangeSet(changeSet);
  if (!deps || typeof deps.review !== 'function') {
    throw new ReviewInputError('deps.review must be a function (prompt) => Promise<Finding[]>');
  }
  const prompt = buildReviewPrompt(changeSet, rubric);
  const raw = await deps.review(prompt);
  return validateFindings(raw);
}

/**
 * Collect the change set from git via an injectable runner.
 *
 * @param {{ base?: string, staged?: boolean }} opts
 * @param {Deps} deps
 * @returns {Promise<ChangeSet>}
 */
export async function collectChangeSet({ base = 'develop', staged = false } = {}, deps) {
  if (!deps || typeof deps.git !== 'function') {
    throw new ReviewInputError('deps.git must be a function (args: string[]) => Promise<string>');
  }
  if (typeof base !== 'string' || base.trim() === '') {
    throw new ReviewInputError(`base must be a non-empty string, received ${describe(base)}`);
  }
  const range = `${base}...HEAD`;
  const diffArgs = staged
    ? ['diff', '--cached', '--unified=3']
    : ['diff', '--unified=3', range];
  const nameArgs = staged
    ? ['diff', '--cached', '--name-status']
    : ['diff', '--name-status', range];

  const diff = await deps.git(diffArgs);
  const nameStatus = await deps.git(nameArgs);
  if (typeof diff !== 'string') {
    throw new ReviewInputError(`git diff runner must return a string, received ${describe(diff)}`);
  }
  return { diff, files: parseNameStatus(nameStatus) };
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

/**
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(len=${value.length})`;
  return typeof value;
}

/**
 * @param {unknown} changeSet
 * @returns {ChangeSet}
 */
function assertChangeSet(changeSet) {
  if (changeSet === null || typeof changeSet !== 'object' || Array.isArray(changeSet)) {
    throw new ReviewInputError(`change set must be an object, received ${describe(changeSet)}`);
  }
  const obj = /** @type {Record<string, unknown>} */ (changeSet);
  if (typeof obj.diff !== 'string') {
    throw new ReviewInputError(`change set .diff must be a string, received ${describe(obj.diff)}`);
  }
  const files = obj.files === undefined ? [] : obj.files;
  if (!Array.isArray(files)) {
    throw new ReviewInputError(`change set .files must be an array, received ${describe(files)}`);
  }
  return { diff: obj.diff, files: /** @type {ChangedFile[]} */ (files) };
}

// ---------------------------------------------------------------------------
// IMPURE SHELL: default git runner + default (refusing) reviewer + CLI.
// ---------------------------------------------------------------------------

const execFileAsync = promisify(execFile);

/**
 * Default git runner — argv array (no shell), so no injection surface.
 *
 * @type {GitFn}
 */
export async function defaultGit(args) {
  const { stdout } = await execFileAsync('git', args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

/**
 * Default reviewer stub. It REFUSES to fabricate findings without a real engine.
 * The prototype ships with no live model; wire `deps.review` to a runSubagent-
 * backed reviewer (see DESIGN.md) or pass --findings/--reviewer on the CLI.
 *
 * @type {ReviewFn}
 */
export async function refusingReviewer() {
  throw new ReviewInputError(
    'No reviewer wired. This prototype does not call a live model. ' +
      'Provide --reviewer <module.mjs> (exports `review`), --findings <canned.json>, ' +
      'or --prompt-out <file> to hand the prompt to an external reviewer. See DESIGN.md.',
  );
}

/**
 * Load a reviewer module by path; expects a default export or named `review`.
 *
 * @param {string} modulePath
 * @returns {Promise<ReviewFn>}
 */
async function loadReviewer(modulePath) {
  const url = pathToFileURL(resolve(process.cwd(), modulePath)).href;
  const mod = await import(url);
  const fn = mod.review ?? mod.default;
  if (typeof fn !== 'function') {
    throw new ReviewInputError(`reviewer module ${modulePath} must export \`review\` or a default function`);
  }
  return fn;
}

/**
 * Build a reviewer that ignores the prompt and returns canned findings from a
 * JSON file. Useful for demoing the CLI pipeline without a live model.
 *
 * @param {string} findingsPath
 * @returns {Promise<ReviewFn>}
 */
async function loadCannedReviewer(findingsPath) {
  const text = await readFile(resolve(process.cwd(), findingsPath), 'utf8');
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : parsed.findings;
  if (!Array.isArray(arr)) {
    throw new ReviewInputError(`--findings file must be a JSON array or { findings: [...] }`);
  }
  return async () => arr;
}

/** CLI entry point. */
async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'develop' },
      staged: { type: 'boolean', default: false },
      threshold: { type: 'string', default: 'warning' },
      reviewer: { type: 'string' },
      findings: { type: 'string' },
      'prompt-out': { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const threshold = /** @type {Severity} */ (values.threshold);
  if (!SEVERITY_SET.has(threshold)) {
    process.stderr.write(`error: --threshold must be one of ${SEVERITIES.join('|')}\n`);
    return 2;
  }

  /** @type {Deps} */
  const deps = { git: defaultGit, review: refusingReviewer };

  // Collect the change set from git.
  const changeSet = await collectChangeSet(
    { base: values.base, staged: Boolean(values.staged) },
    deps,
  );

  // If asked, dump the prompt for an external reviewer and stop.
  if (values['prompt-out']) {
    await writeFile(values['prompt-out'], buildReviewPrompt(changeSet), 'utf8');
    process.stderr.write(`Wrote review prompt to ${values['prompt-out']}\n`);
    return 0;
  }

  // Choose a reviewer implementation.
  if (values.reviewer) {
    deps.review = await loadReviewer(values.reviewer);
  } else if (values.findings) {
    deps.review = await loadCannedReviewer(values.findings);
  }

  const findings = await reviewChangeSet(changeSet, deps);
  const report = buildReport({ findings, threshold });

  if (values.out) {
    await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  if (values.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatHumanSummary(report) + '\n');
  }

  // Exit non-zero when blocking so the pre-push hook aborts the push.
  return report.blocking ? 1 : 0;
}

const USAGE = `local-review — prototype pre-push code-review gate

Usage:
  node reviewDiff.mjs [options]

Options:
  --base <ref>          Base ref for the range diff (default: develop -> base...HEAD)
  --staged              Review the staged index (git diff --cached) instead of a range
  --threshold <sev>     Blocking threshold: blocker|warning|nit (default: warning)
  --reviewer <path>     Load a reviewer module (exports \`review\` or default fn)
  --findings <path>     Use canned findings from a JSON file (array or { findings: [] })
  --prompt-out <path>   Write the review prompt to a file and exit (for an external reviewer)
  --out <path>          Write the JSON report to a file
  --json                Print the JSON report to stdout instead of the human summary
  --help                Show this help

Exit code: 1 when any finding is at or above --threshold, else 0.
`;

// Run as CLI only when invoked directly (not when imported by tests).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`local-review error: ${err?.message ?? err}\n`);
      process.exit(2);
    });
}
