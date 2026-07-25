// Pure lvkit single-VI scan model (VHS-REQ-714, epic #2348 Phase A). Turns the
// verbatim text output of a LabVIEW-free `lvkit generate` run over ONE VI into a
// schema-tagged, deterministic store envelope so an agent MCP surface can later
// read the VI as agent-readable Python. This module is pure and dependency-free:
// it performs NO process, filesystem, or network I/O. The orchestrator
// (`lvkitViScanProvider.ts`) runs lvkit behind an injectable boundary, reads the
// generated files, and hands the already-captured module texts here.
//
// The envelope stores every generated module verbatim (never re-serialized), in
// a deterministic order, and identifies a best-effort primary module for the
// scanned VI. Every invalid input is a thrown, descriptive error (fail-closed)
// so the orchestrator maps it to a typed `failed` result rather than persisting a
// silently-empty or malformed scan.

export const LVKIT_VI_SCAN_SCHEMA = 'vi-history-suite/lvkit-vi-scan@v1';
export const LVKIT_VI_SCAN_SCHEMA_VERSION = 1;

/** How lvkit was resolved for the scan (provenance, mirrors the locator). */
export type LvkitScanSource = 'env' | 'path' | 'uvx';

/** The complete set of valid {@link LvkitScanSource} provenance values. */
export const LVKIT_SCAN_SOURCES: readonly LvkitScanSource[] = ['env', 'path', 'uvx'];

/** One generated Python file, captured verbatim. */
export interface LvkitGeneratedModule {
  /** Output-relative POSIX path of the generated file (e.g. `pkg/sub/vi.py`). */
  readonly relativePath: string;
  /** Verbatim generated Python content, exactly as lvkit emitted it. */
  readonly python: string;
}

/**
 * #2376 (primitive-mapping-pack) provenance: how lvkit resolved one generated
 * module, derived purely from its path + content (no lvkit hook needed):
 *  - `resolved`              clean generate, no unresolved markers.
 *  - `unresolved-primitive`  inline `raise PrimitiveResolutionNeeded(...)` (the
 *                            PRIMITIVE wall in `--placeholder-on-unresolved`
 *                            mode -- note this lives in a NORMALLY-named module,
 *                            NOT a `.error.py`, so `errorModuleCount` alone
 *                            undercounts unresolved primitives).
 *  - `unresolved-vilib`      inline `raise VILibResolutionNeeded(...)` (the
 *                            vi.lib SubVI wall surfaced inline, mirrors above).
 *  - `error-stub`            lvkit emitted a `.error.py` hard-failure stub.
 * A consumer uses this to tell a signature-faithful clean generate from a
 * placeholder that still needs a cleanroom mapping (fidelity tier), the T1+T2
 * vs unresolved distinction from the bus ANSWER.
 */
export type LvkitModuleResolution =
  | 'resolved'
  | 'unresolved-primitive'
  | 'unresolved-vilib'
  | 'error-stub';

/** The complete set of valid {@link LvkitModuleResolution} values. */
export const LVKIT_MODULE_RESOLUTIONS: readonly LvkitModuleResolution[] = [
  'resolved',
  'unresolved-primitive',
  'unresolved-vilib',
  'error-stub'
];

/** Per-VI tally of {@link LvkitModuleResolution} outcomes across all modules. */
export interface LvkitResolutionCounts {
  readonly resolved: number;
  readonly unresolvedPrimitive: number;
  readonly unresolvedVilib: number;
  readonly errorStub: number;
}

/** Schema-tagged store envelope for a single-VI lvkit scan. */
export interface LvkitViScanEnvelope {
  readonly schema: typeof LVKIT_VI_SCAN_SCHEMA;
  readonly schemaVersion: typeof LVKIT_VI_SCAN_SCHEMA_VERSION;
  /** Logical VI path the scan was requested for (repository-relative, POSIX). */
  readonly viPath: string;
  /** Content signature of the scanned VI bytes (e.g. `sha256:<hex>`). */
  readonly contentSignature: string;
  /** Runtime the scanned VI was staged on (e.g. `host-native`, `windows-container`). */
  readonly runtime: string;
  /** ISO-8601 timestamp the scan envelope was built (injected clock). */
  readonly generatedAt: string;
  /** How lvkit was resolved for the run. */
  readonly lvkitSource: LvkitScanSource;
  /**
   * Best-effort pointer to the scanned VI's own generated module (the file whose
   * base name matches the VI's lvkit slug); `null` when it cannot be identified
   * confidently. The full text is always present in `modules` regardless.
   */
  readonly primaryModule: LvkitGeneratedModule | null;
  /** Every generated module, verbatim, sorted by `relativePath`. */
  readonly modules: readonly LvkitGeneratedModule[];
  /** Total number of generated modules. */
  readonly moduleCount: number;
  /** Count of modules lvkit emitted as unresolved `.error.py` stubs. */
  readonly errorModuleCount: number;
  /** `moduleCount - errorModuleCount`. */
  readonly resolvedModuleCount: number;
  /**
   * #2376 provenance: per-VI tally of module resolution outcomes (clean vs the
   * primitive wall vs the vi.lib wall vs SubVI `.error.py` stubs), derived from
   * `modules`. Optional + additive: envelopes captured before this field existed
   * omit it and stay valid (the shared store read-guard tolerates its absence);
   * new envelopes always carry it. Unlike `errorModuleCount` (which counts only
   * `.error.py`), this separately surfaces the inline `raise ...ResolutionNeeded`
   * placeholders a `--placeholder-on-unresolved` born-from-scratch generate emits
   * in normally-named modules, so a consumer sees the two walls distinctly.
   *
   * Note `resolutionCounts.resolved` is the HONEST clean count -- it EXCLUDES the
   * inline `unresolved-primitive` placeholders -- so it intentionally differs from
   * the legacy `resolvedModuleCount` (= `moduleCount - errorModuleCount`), which
   * counts an inline-primitive-raise module as resolved because `errorModuleCount`
   * only sees `.error.py`. The legacy counts are retained UNCHANGED for back-compat
   * and the store guard's consistency check; `resolutionCounts` supersedes them as
   * the accurate born-from-scratch cleanliness signal (agreed cross-leg, #2376).
   */
  readonly resolutionCounts?: LvkitResolutionCounts;
}

/** Input for {@link buildLvkitViScanEnvelope}: already-captured lvkit output + metadata. */
export interface BuildLvkitViScanEnvelopeInput {
  readonly viPath: string;
  readonly contentSignature: string;
  readonly runtime: string;
  readonly generatedAt: string;
  readonly lvkitSource: LvkitScanSource;
  readonly modules: readonly LvkitGeneratedModule[];
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`lvkit-vi-scan: ${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`lvkit-vi-scan: ${field} must be a non-empty string`);
  }
  return trimmed;
}

// Require a real ISO-8601 instant. `Date.parse` alone is too permissive: it
// accepts non-ISO text (e.g. `July 24, 2026`) and silently rolls impossible
// calendar dates over (e.g. `2026-02-31` -> Mar 3). So we (1) require the
// canonical ISO-8601 shape and (2) round-trip the named calendar fields through
// `Date.UTC` and require they come back unchanged, rejecting impossible dates.
const ISO_8601_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Classify a candidate timestamp: `not-iso` when it fails the canonical ISO-8601
 * shape or does not parse, `not-real` when it parses but names an impossible
 * calendar instant (e.g. `2026-02-31`), otherwise `ok`. Shared by the builder
 * (which maps each outcome to a distinct fail-closed error) and the store read
 * guard (which treats anything but `ok` as a cache miss), so both validate a
 * timestamp identically without duplicating the logic.
 */
function classifyIsoTimestamp(text: string): 'ok' | 'not-iso' | 'not-real' {
  const match = ISO_8601_INSTANT.exec(text);
  if (!match || !Number.isFinite(Date.parse(text))) {
    return 'not-iso';
  }
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    return 'not-real';
  }
  return 'ok';
}

/**
 * True only for a real ISO-8601 instant (canonical shape, parses, and names a
 * valid calendar date). Exported so the scan store's fail-closed read guard can
 * reject a tampered `generatedAt` exactly as {@link buildLvkitViScanEnvelope}
 * enforces it, without duplicating the validation.
 */
export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && classifyIsoTimestamp(value) === 'ok';
}

function requireIsoTimestamp(value: unknown): string {
  const text = requireNonEmptyString(value, 'generatedAt');
  const classification = classifyIsoTimestamp(text);
  if (classification === 'not-iso') {
    throw new Error('lvkit-vi-scan: generatedAt must be an ISO-8601 timestamp');
  }
  if (classification === 'not-real') {
    throw new Error('lvkit-vi-scan: generatedAt is not a real calendar instant');
  }
  return text;
}

/** Normalize a Windows or POSIX relative path to POSIX separators. */
function toPosixRelativePath(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Derive lvkit's file/function slug for a VI name: lower-cased, whitespace runs
 * to a single underscore, all other non-`[a-z0-9_]` characters removed, and
 * leading/trailing/duplicate underscores collapsed. Matches lvkit's observed
 * naming (`Make path absolute` -> `make_path_absolute`,
 * `MenuSelection(User)` -> `menuselectionuser`). Best-effort only; the primary
 * module is optional and never a fail-closed condition.
 */
export function deriveViNameSlug(viName: string): string {
  return viName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Base name of a POSIX path (segment after the last `/`). */
function posixBaseName(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash === -1 ? relativePath : relativePath.slice(lastSlash + 1);
}

/**
 * Slug of a generated module file: its base name with a trailing `.py` and an
 * optional `.error` marker removed (`foo.py` and `foo.error.py` both -> `foo`).
 */
function moduleBaseSlug(relativePath: string): string {
  let base = posixBaseName(relativePath);
  if (base.endsWith('.py')) {
    base = base.slice(0, -'.py'.length);
  }
  if (base.endsWith('.error')) {
    base = base.slice(0, -'.error'.length);
  }
  return base;
}

function isErrorModule(relativePath: string): boolean {
  return posixBaseName(relativePath).endsWith('.error.py');
}

// Match the RAISE statement (not the `from ... import ...` line) so the import
// of the exception class never false-positives a clean module.
const PRIMITIVE_RAISE = /\braise\s+PrimitiveResolutionNeeded\b/;
const VILIB_RAISE = /\braise\s+VILibResolutionNeeded\b/;

/**
 * #2376: classify one generated module's resolution provenance from its path +
 * content. `.error.py` (the hard SubVI stub) takes precedence over an inline
 * placeholder raise; a clean module with neither marker is `resolved`. Pure and
 * deterministic.
 */
export function classifyModuleResolution(module: LvkitGeneratedModule): LvkitModuleResolution {
  if (isErrorModule(module.relativePath)) {
    return 'error-stub';
  }
  const python = typeof module.python === 'string' ? module.python : '';
  if (PRIMITIVE_RAISE.test(python)) {
    return 'unresolved-primitive';
  }
  if (VILIB_RAISE.test(python)) {
    return 'unresolved-vilib';
  }
  return 'resolved';
}

/**
 * #2376: tally {@link classifyModuleResolution} across a module set. The four
 * counts sum to the module count, giving a per-VI resolution provenance profile
 * (clean vs primitive-wall vs vilib-wall vs SubVI-stub) beyond the coarse
 * resolved/error split.
 */
export function summarizeModuleResolutions(
  modules: readonly LvkitGeneratedModule[]
): LvkitResolutionCounts {
  let resolved = 0;
  let unresolvedPrimitive = 0;
  let unresolvedVilib = 0;
  let errorStub = 0;
  for (const module of modules) {
    switch (classifyModuleResolution(module)) {
      case 'resolved':
        resolved += 1;
        break;
      case 'unresolved-primitive':
        unresolvedPrimitive += 1;
        break;
      case 'unresolved-vilib':
        unresolvedVilib += 1;
        break;
      case 'error-stub':
        errorStub += 1;
        break;
    }
  }
  return { resolved, unresolvedPrimitive, unresolvedVilib, errorStub };
}

function normalizeModules(
  modules: readonly LvkitGeneratedModule[]
): LvkitGeneratedModule[] {
  if (!Array.isArray(modules)) {
    throw new Error('lvkit-vi-scan: modules must be an array');
  }
  if (modules.length === 0) {
    throw new Error('lvkit-vi-scan: modules must not be empty (lvkit generate emitted no files)');
  }
  const seen = new Set<string>();
  const normalized = modules.map((module, index) => {
    if (typeof module !== 'object' || module === null) {
      throw new Error(`lvkit-vi-scan: modules[${index}] must be an object`);
    }
    const relativePath = toPosixRelativePath(
      requireNonEmptyString(module.relativePath, `modules[${index}].relativePath`)
    );
    if (typeof module.python !== 'string') {
      throw new Error(`lvkit-vi-scan: modules[${index}].python must be a string`);
    }
    if (seen.has(relativePath)) {
      throw new Error(`lvkit-vi-scan: duplicate module relativePath "${relativePath}"`);
    }
    seen.add(relativePath);
    // VHS-REQ-714: normalize generated-Python line endings to LF so the SAME VI
    // yields a byte-identical envelope (and thus a stable content address) whether
    // lvkit ran on Windows (CRLF) or Linux (LF). Without this, a Windows and a
    // Linux born-from-scratch generate of one VI differ only by EOL and split the
    // shared lvkit-vi-scan cache / diverge on any generated-Python hash (#2373).
    return { relativePath, python: module.python.replace(/\r\n/g, '\n') };
  });
  normalized.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0
  );
  return normalized;
}

/**
 * VHS-REQ-714: build the schema-tagged single-VI scan envelope from already-
 * captured lvkit output. Pure and deterministic; fail-closed (throws) on any
 * invalid input so a malformed run is an explicit error, never a silently-empty
 * or partial persisted scan.
 */
export function buildLvkitViScanEnvelope(
  input: BuildLvkitViScanEnvelopeInput
): LvkitViScanEnvelope {
  if (typeof input !== 'object' || input === null) {
    throw new Error('lvkit-vi-scan: input must be an object');
  }
  const viPath = toPosixRelativePath(requireNonEmptyString(input.viPath, 'viPath'));
  const contentSignature = requireNonEmptyString(input.contentSignature, 'contentSignature');
  const runtime = requireNonEmptyString(input.runtime, 'runtime');
  const generatedAt = requireIsoTimestamp(input.generatedAt);
  if (!LVKIT_SCAN_SOURCES.includes(input.lvkitSource)) {
    throw new Error(
      `lvkit-vi-scan: lvkitSource must be one of ${LVKIT_SCAN_SOURCES.join(', ')}`
    );
  }
  const modules = normalizeModules(input.modules);

  const viSlug = deriveViNameSlug(posixBaseName(viPath).replace(/\.vi$/i, ''));
  const primaryModule =
    viSlug.length === 0
      ? null
      : modules.find((module) => moduleBaseSlug(module.relativePath) === viSlug) ?? null;

  const errorModuleCount = modules.reduce(
    (count, module) => (isErrorModule(module.relativePath) ? count + 1 : count),
    0
  );

  return {
    schema: LVKIT_VI_SCAN_SCHEMA,
    schemaVersion: LVKIT_VI_SCAN_SCHEMA_VERSION,
    viPath,
    contentSignature,
    runtime,
    generatedAt,
    lvkitSource: input.lvkitSource,
    primaryModule,
    modules,
    moduleCount: modules.length,
    errorModuleCount,
    resolvedModuleCount: modules.length - errorModuleCount,
    resolutionCounts: summarizeModuleResolutions(modules)
  };
}
