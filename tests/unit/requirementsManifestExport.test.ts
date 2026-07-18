import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// Requirement coverage: VHS-REQ-601 (Requirements As Agent Work Contracts).
// Criterion coverage: VHS-REQ-601.29 — a deterministic exporter serializes the
// active requirement set into out/requirements/requirements-manifest.json,
// stamped with extensionVersion + extensionCommit and a stable content digest,
// so a shipped VSIX carries the exact requirements it was built from.

const manifestModule = require('../../scripts/exportRequirementsManifest.js') as {
  SCHEMA_VERSION: number;
  MANIFEST_SCHEMA_ID: string;
  parseRequirementsFromSrs: (srsText: string) => Array<{
    id: string;
    status: string;
    area: string;
    title: string;
    parent: string;
    statement: string;
    acceptanceCriteria: Array<{ id: string; text: string }>;
    implementationRefs: string[];
    verificationRefs: string[];
  }>;
  computeIntegrityDigest: (requirements: unknown[]) => string;
  buildRequirementsManifest: (options: {
    srsText?: string;
    rtmText?: string;
    extensionVersion?: string;
    extensionCommit?: string;
    generatedAt?: string;
  }) => {
    $schema: string;
    schemaVersion: number;
    extensionVersion: string;
    extensionCommit: string;
    generatedAt: string;
    counts: { requirements: number; criteria: number };
    requirements: Array<{ id: string; acceptanceCriteria: Array<{ id: string; text: string }> }>;
    integrityDigest: string;
  };
  renderManifestMarkdown: (manifest: unknown) => string;
  renderSchema: (options?: { provenance?: unknown }) => string;
  REQUIREMENTS_MANIFEST_JSON_SCHEMA: { required: string[]; properties: Record<string, { const?: unknown }> };
  exportRequirementsManifest: (deps?: Record<string, unknown>) => {
    jsonPath: string;
    markdownPath?: string;
    manifest: { extensionVersion: string; extensionCommit: string; counts: { requirements: number } };
  };
  main: (argv?: string[], deps?: Record<string, unknown>) => number;
};

const {
  SCHEMA_VERSION,
  MANIFEST_SCHEMA_ID,
  parseRequirementsFromSrs,
  computeIntegrityDigest,
  buildRequirementsManifest,
  renderManifestMarkdown,
  renderSchema,
  REQUIREMENTS_MANIFEST_JSON_SCHEMA,
  exportRequirementsManifest,
  main
} = manifestModule;

const FIXTURE_SRS = [
  '### VHS-REQ-001: First Active Requirement',
  '',
  '- Status: Active',
  '- Parent: VHS-SYS-REQ-001',
  '- Area: Detection',
  '- Statement: The tool shall do the first thing',
  '  across a wrapped line.',
  '- Acceptance Criteria:',
  '  - First criterion does a thing.',
  '  - Second criterion does another thing',
  '    that wraps to a second line.',
  '- Agent Work Scope:',
  '  - Change the first thing.',
  '- Implementation References:',
  '  - `src/first.ts`',
  '- Verification References:',
  '  - `tests/unit/first.test.ts`',
  '- Change Guidance:',
  '  - Keep it narrow.',
  '',
  '### VHS-REQ-002: Retired Requirement',
  '',
  '- Status: Retired',
  '- Parent: VHS-SYS-REQ-001',
  '- Area: Detection',
  '- Statement: This one is retired.',
  '- Acceptance Criteria:',
  '  - Should be excluded.',
  '- Implementation References:',
  '  - `src/retired.ts`',
  '- Verification References:',
  '  - `tests/unit/retired.test.ts`',
  '',
  '### VHS-REQ-003: Second Active Requirement',
  '',
  '- Status: Active',
  '- Parent: VHS-SYS-REQ-002',
  '- Area: Reporting',
  '- Statement: The tool shall do the second thing.',
  '- Acceptance Criteria:',
  '  - Only criterion here.',
  '- Implementation References:',
  '  - `src/second.ts`',
  '- Verification References:',
  '  - `tests/unit/second.test.ts`',
  ''
].join('\n');

const FIXTURE_RTM = [
  'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
  'VHS-REQ-001,VHS-SYS-REQ-001,Active,Detection,First Active Requirement,src/first.ts,tests/unit/first.test.ts,note',
  'VHS-REQ-002,VHS-SYS-REQ-001,Retired,Detection,Retired Requirement,src/retired.ts,tests/unit/retired.test.ts,note',
  'VHS-REQ-003,VHS-SYS-REQ-002,Active,Reporting,Second Active Requirement,src/second.ts,tests/unit/second.test.ts,note'
].join('\n');

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-req-manifest-'));
  tempDirs.push(dir);
  return dir;
}

describe('exportRequirementsManifest', () => {
  it('parses only Active requirements with positional criterion ids and stripped refs (VHS-REQ-601)', () => {
    const requirements = parseRequirementsFromSrs(FIXTURE_SRS);

    expect(requirements.map((requirement) => requirement.id)).toEqual([
      'VHS-REQ-001',
      'VHS-REQ-003'
    ]);

    const first = requirements[0];
    expect(first.status).toBe('Active');
    expect(first.area).toBe('Detection');
    expect(first.title).toBe('First Active Requirement');
    expect(first.parent).toBe('VHS-SYS-REQ-001');
    expect(first.statement).toBe('The tool shall do the first thing across a wrapped line.');
    expect(first.acceptanceCriteria).toEqual([
      { id: 'VHS-REQ-001.1', text: 'First criterion does a thing.' },
      { id: 'VHS-REQ-001.2', text: 'Second criterion does another thing that wraps to a second line.' }
    ]);
    // Backticks are stripped so refs are plain repo-relative paths.
    expect(first.implementationRefs).toEqual(['src/first.ts']);
    expect(first.verificationRefs).toEqual(['tests/unit/first.test.ts']);
  });

  it('builds a schema-tagged manifest envelope with counts (VHS-REQ-601.29)', () => {
    const manifest = buildRequirementsManifest({
      srsText: FIXTURE_SRS,
      rtmText: FIXTURE_RTM,
      extensionVersion: '9.9.9',
      extensionCommit: 'abcdef1234567890',
      generatedAt: '2026-07-15T00:00:00.000Z'
    });

    expect(manifest.$schema).toBe(MANIFEST_SCHEMA_ID);
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.extensionVersion).toBe('9.9.9');
    expect(manifest.extensionCommit).toBe('abcdef1234567890');
    expect(manifest.generatedAt).toBe('2026-07-15T00:00:00.000Z');
    expect(manifest.counts).toEqual({ requirements: 2, criteria: 3 });
    expect(Object.keys(manifest)).toEqual([
      '$schema',
      'schemaVersion',
      'extensionVersion',
      'extensionCommit',
      'generatedAt',
      'counts',
      'requirements',
      'integrityDigest'
    ]);
  });

  it('keeps the integrity digest version/time-independent but content-sensitive (VHS-REQ-601.29)', () => {
    const base = buildRequirementsManifest({
      srsText: FIXTURE_SRS,
      extensionVersion: '1.0.0',
      extensionCommit: 'aaaaaaaaaaaa',
      generatedAt: '2026-01-01T00:00:00.000Z'
    });
    const differentBuild = buildRequirementsManifest({
      srsText: FIXTURE_SRS,
      extensionVersion: '2.5.7',
      extensionCommit: 'bbbbbbbbbbbb',
      generatedAt: '2026-12-31T23:59:59.000Z'
    });
    // Same requirement content -> identical digest regardless of version/commit/time.
    expect(differentBuild.integrityDigest).toBe(base.integrityDigest);

    const changedContent = buildRequirementsManifest({
      srsText: FIXTURE_SRS.replace('First criterion does a thing.', 'First criterion CHANGED.'),
      extensionVersion: '1.0.0',
      extensionCommit: 'aaaaaaaaaaaa',
      generatedAt: '2026-01-01T00:00:00.000Z'
    });
    // A changed acceptance criterion moves the digest (drift is detectable).
    expect(changedContent.integrityDigest).not.toBe(base.integrityDigest);
    expect(changedContent.integrityDigest).toBe(
      computeIntegrityDigest(changedContent.requirements)
    );
  });

  it('fails closed when the SRS and RTM active ID sets disagree (VHS-REQ-601)', () => {
    const rtmMissingReq003 = [
      'ReqID,ParentID,Status,Area,Title,ImplementationRefs,VerificationRefs,Notes',
      'VHS-REQ-001,VHS-SYS-REQ-001,Active,Detection,First,src/first.ts,tests/unit/first.test.ts,note'
    ].join('\n');

    expect(() =>
      buildRequirementsManifest({
        srsText: FIXTURE_SRS,
        rtmText: rtmMissingReq003,
        extensionVersion: '1.0.0',
        extensionCommit: 'aaaaaaaaaaaa',
        generatedAt: '2026-01-01T00:00:00.000Z'
      })
    ).toThrow(/ID sets disagree/);
  });

  it('renders a human-readable markdown table (VHS-REQ-601)', () => {
    const manifest = buildRequirementsManifest({
      srsText: FIXTURE_SRS,
      extensionVersion: '9.9.9',
      extensionCommit: 'abcdef1234567890',
      generatedAt: '2026-07-15T00:00:00.000Z'
    });
    const markdown = renderManifestMarkdown(manifest);

    expect(markdown).toContain('# Requirements Manifest');
    expect(markdown).toContain('- Extension version: `9.9.9`');
    expect(markdown).toContain('| `VHS-REQ-001` | Detection | First Active Requirement | 2 |');
    expect(markdown).toContain('| `VHS-REQ-003` | Reporting | Second Active Requirement | 1 |');
  });

  it('writes json and markdown build products with injected version/commit stamping (VHS-REQ-601.29)', () => {
    const repoRoot = makeTempDir();
    const outputDir = path.join(repoRoot, 'out', 'requirements');
    const readFile = (relativePath: string): string => {
      if (relativePath === 'docs/requirements/srs.md') {
        return FIXTURE_SRS;
      }
      if (relativePath === 'docs/requirements/rtm.csv') {
        return FIXTURE_RTM;
      }
      throw new Error(`unexpected read ${relativePath}`);
    };

    const result = exportRequirementsManifest({
      repoRoot,
      outputDir,
      readFile,
      getGitCommit: () => 'cafebabecafebabe',
      getPackageVersion: () => '3.2.1',
      now: () => new Date('2026-07-15T12:00:00.000Z')
    });

    expect(result.jsonPath).toBe(path.join(outputDir, 'requirements-manifest.json'));
    expect(result.markdownPath).toBe(path.join(outputDir, 'requirements-manifest.md'));
    expect(result.manifest.extensionVersion).toBe('3.2.1');
    expect(result.manifest.extensionCommit).toBe('cafebabecafebabe');

    const written = JSON.parse(fs.readFileSync(result.jsonPath, 'utf8')) as {
      counts: { requirements: number; criteria: number };
      extensionVersion: string;
    };
    expect(written.counts).toEqual({ requirements: 2, criteria: 3 });
    expect(written.extensionVersion).toBe('3.2.1');
    expect(fs.existsSync(result.markdownPath as string)).toBe(true);
  });

  it('skips markdown when includeMarkdown is false (VHS-REQ-601)', () => {
    const repoRoot = makeTempDir();
    const outputDir = path.join(repoRoot, 'out', 'requirements');
    const result = exportRequirementsManifest({
      repoRoot,
      outputDir,
      includeMarkdown: false,
      readFile: (relativePath: string) => {
        if (relativePath === 'docs/requirements/srs.md') {
          return FIXTURE_SRS;
        }
        throw new Error(`no ${relativePath}`);
      },
      getGitCommit: () => 'cafebabecafebabe',
      getPackageVersion: () => '3.2.1',
      now: () => new Date('2026-07-15T12:00:00.000Z')
    });
    expect(result.markdownPath).toBeUndefined();
    expect(fs.existsSync(path.join(outputDir, 'requirements-manifest.md'))).toBe(false);
  });

  it('main returns 0 and prints a stamp line on success, 1 on failure (VHS-REQ-601)', () => {
    const repoRoot = makeTempDir();
    const outputs: string[] = [];
    const okCode = main(['--no-markdown'], {
      repoRoot,
      outputDir: path.join(repoRoot, 'out', 'requirements'),
      readFile: (relativePath: string) => {
        if (relativePath === 'docs/requirements/srs.md') {
          return FIXTURE_SRS;
        }
        throw new Error(`no ${relativePath}`);
      },
      getGitCommit: () => 'cafebabecafebabe',
      getPackageVersion: () => '3.2.1',
      now: () => new Date('2026-07-15T12:00:00.000Z'),
      stdout: { write: (text: string) => outputs.push(text) }
    });
    expect(okCode).toBe(0);
    expect(outputs.join('')).toContain('[requirements-manifest] Generated');

    const failCode = main([], {
      repoRoot,
      readFile: () => {
        throw new Error('missing srs');
      },
      stdout: { write: () => undefined }
    });
    expect(failCode).toBe(1);
  });

  it('publishes the manifest JSON Schema via --schema without exporting (VHS-REQ-601)', () => {
    const schema = JSON.parse(renderSchema()) as {
      $id: string;
      required: string[];
      properties: { $schema: { const: string }; schemaVersion: { const: number } };
    };
    expect(schema.$id).toBe(MANIFEST_SCHEMA_ID);
    expect(schema.properties.$schema.const).toBe(MANIFEST_SCHEMA_ID);
    expect(schema.properties.schemaVersion.const).toBe(SCHEMA_VERSION);

    // The built manifest self-describes and satisfies the published schema contract (no drift).
    const manifest = buildRequirementsManifest({
      srsText: FIXTURE_SRS,
      extensionVersion: '1.0.0',
      extensionCommit: 'aaaaaaaaaaaa',
      generatedAt: '2026-01-01T00:00:00.000Z'
    }) as unknown as Record<string, unknown>;
    expect(REQUIREMENTS_MANIFEST_JSON_SCHEMA.required.filter((key) => !(key in manifest))).toEqual([]);
    expect(manifest.$schema).toBe(REQUIREMENTS_MANIFEST_JSON_SCHEMA.properties.$schema.const);
    expect(manifest.schemaVersion).toBe(REQUIREMENTS_MANIFEST_JSON_SCHEMA.properties.schemaVersion.const);

    // --schema attaches provenance under the shared extension key.
    const withProvenance = JSON.parse(renderSchema({ provenance: { generatedAt: 'x' } })) as Record<string, unknown>;
    expect(withProvenance['x-vi-history-suite-provenance']).toEqual({ generatedAt: 'x' });

    // main --schema publishes the schema and does not export (no writeFile invoked).
    const outputs: string[] = [];
    let wrote = false;
    const code = main(['--schema'], {
      writeFile: () => {
        wrote = true;
      },
      stdout: { write: (text: string) => outputs.push(text) }
    });
    expect(code).toBe(0);
    expect(wrote).toBe(false);
    expect((JSON.parse(outputs.join('')) as Record<string, unknown>).$id).toBe(MANIFEST_SCHEMA_ID);
  });
});
