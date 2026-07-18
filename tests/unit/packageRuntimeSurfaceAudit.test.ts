import { describe, expect, it } from 'vitest';

const {
  ALLOWED_RUNTIME_DEPENDENCIES,
  auditPackagedRuntimeSurface,
  buildVsceFailureMessage,
  findRuntimeSurfaceViolations,
  parseVsceListOutput,
  summarizeCommandOutput
} = require('../../scripts/auditPackagedRuntimeSurface.js') as {
  ALLOWED_RUNTIME_DEPENDENCIES: string[];
  auditPackagedRuntimeSurface: (deps?: {
    cwd?: string;
    spawnSync?: (
      command: string,
      args: string[],
      options: unknown
    ) => { error?: Error; status?: number | null; stdout?: string; stderr?: string };
    stdout?: { write: (chunk: string) => void };
    stderr?: { write: (chunk: string) => void };
    manifest?: { dependencies?: Record<string, string> };
    vsceCliPath?: string;
    execPath?: string;
  }) => { packagedPaths: string[] };
  buildVsceFailureMessage: (result: {
    status?: number | null;
    stdout?: string;
    stderr?: string;
  }) => string;
  findRuntimeSurfaceViolations: (input: {
    manifest: { dependencies?: Record<string, string> };
    packagedPaths: string[];
  }) => string[];
  parseVsceListOutput: (stdout: string) => string[];
  summarizeCommandOutput: (value: unknown, maxLength?: number) => string;
};

describe('packaged runtime surface audit', () => {
  it('normalizes vsce file lists and ignores blank lines', () => {
    expect(
      parseVsceListOutput(
        'package.json\r\nout/extension.js\r\n\r\nresources/bundled-docs/manifest.json\r\n'
      )
    ).toEqual(['package.json', 'out/extension.js', 'resources/bundled-docs/manifest.json']);
  });

  it('reports bounded stdout and stderr when the pinned vsce list command fails', () => {
    const message = buildVsceFailureMessage({
      status: 1,
      stdout: `${'packaged-path\n'.repeat(500)}final stdout line`,
      stderr: 'npm warn deprecated glob@11.1.0\nfatal packaging failure'
    });

    // VHS-REQ-602.4
    expect(message).toContain('vsce ls failed with exit code 1.');
    expect(message).toContain('stdout:');
    expect(message).toContain('packaged-path');
    expect(message).toContain('[truncated');
    expect(message).toContain('stderr:');
    expect(message).toContain('fatal packaging failure');
  });

  it('fails when runtime dependencies are declared or forbidden packaged paths leak in', () => {
    expect(
      findRuntimeSurfaceViolations({
        manifest: {
          dependencies: {
            glob: '^13.0.6'
          }
        },
        packagedPaths: [
          'package.json',
          'out/extension.js',
          'extension/node_modules/glob/package.json',
          '.vscode-test/vscode-linux-x64/resources/app/node_modules.asar'
        ]
      })
    ).toEqual([
      'Unexpected runtime dependencies are not allowed in package.json: glob',
      'Packaged VSIX surface includes forbidden runtime paths: extension/node_modules/glob/package.json, .vscode-test/vscode-linux-x64/resources/app/node_modules.asar',
      'Packaged VSIX surface includes forbidden package payloads: extension/node_modules/glob/package.json'
    ]);
  });

  it('fails closed when an allowed runtime dependency is declared but not packaged', () => {
    expect(
      findRuntimeSurfaceViolations({
        manifest: {
          dependencies: {
            'jsonc-parser': '^3.3.1'
          }
        },
        packagedPaths: [
          'package.json',
          'out/extension.js',
          'resources/bundled-docs/manifest.json'
        ]
      })
    ).toEqual([
      'Packaged VSIX surface is missing allowed runtime dependency payloads: jsonc-parser'
    ]);
  });

  it('passes for the current runtime package surface', () => {
    expect(ALLOWED_RUNTIME_DEPENDENCIES).toEqual(['jsonc-parser']);
    expect(
      findRuntimeSurfaceViolations({
        manifest: {
          dependencies: {
            'jsonc-parser': '^3.3.1'
          }
        },
        packagedPaths: [
          'package.json',
          'out/extension.js',
          'node_modules/jsonc-parser/lib/esm/main.js',
          'node_modules/jsonc-parser/package.json',
          'resources/bundled-docs/manifest.json'
        ]
      })
    ).toEqual([]);
  });

  it('drops WARNING lines from the vsce output', () => {
    expect(
      parseVsceListOutput('WARNING: deprecated\npackage.json\nWARNING again\nout/extension.js')
    ).toEqual(['package.json', 'out/extension.js']);
  });

  it('reports an unknown exit code when the vsce status is not numeric', () => {
    const message = buildVsceFailureMessage({ stdout: 'out', stderr: 'err' });
    expect(message).toContain('vsce ls failed with exit code unknown.');
  });

  it('flags a path that ends exactly at a forbidden directory (suffix match)', () => {
    expect(
      findRuntimeSurfaceViolations({
        manifest: { dependencies: {} },
        packagedPaths: ['package.json', 'extension/node_modules']
      })
    ).toEqual([
      'Packaged VSIX surface includes forbidden runtime paths: extension/node_modules'
    ]);
  });

  it('accepts an allowed dependency payload referenced by its exact root path', () => {
    expect(
      findRuntimeSurfaceViolations({
        manifest: { dependencies: { 'jsonc-parser': '^3.3.1' } },
        packagedPaths: ['package.json', 'node_modules/jsonc-parser']
      })
    ).toEqual([]);
  });
});

describe('summarizeCommandOutput', () => {
  it('reports <empty> for empty, whitespace, or nullish input', () => {
    expect(summarizeCommandOutput('')).toBe('<empty>');
    expect(summarizeCommandOutput('   ')).toBe('<empty>');
    expect(summarizeCommandOutput(undefined)).toBe('<empty>');
  });

  it('returns short output unchanged and truncates output beyond the limit', () => {
    expect(summarizeCommandOutput('short')).toBe('short');
    expect(summarizeCommandOutput('x'.repeat(20), 5)).toBe(`${'x'.repeat(5)}\n[truncated 15 characters]`);
  });
});

describe('auditPackagedRuntimeSurface orchestration', () => {
  const baseDeps = (overrides: Record<string, unknown> = {}) => ({
    vsceCliPath: 'vsce-cli.js',
    execPath: 'node',
    stdout: { write: () => undefined },
    stderr: { write: () => undefined },
    ...overrides
  });

  it('returns the packaged paths and reports success for a clean surface', () => {
    const stdoutChunks: string[] = [];
    const result = auditPackagedRuntimeSurface(
      baseDeps({
        spawnSync: () => ({
          status: 0,
          stdout: [
            'package.json',
            'out/extension.js',
            'node_modules/jsonc-parser/package.json',
            'resources/bundled-docs/manifest.json'
          ].join('\n')
        }),
        manifest: { dependencies: { 'jsonc-parser': '^3.3.1' } },
        stdout: { write: (chunk: string) => stdoutChunks.push(chunk) }
      })
    );

    expect(result.packagedPaths).toContain('node_modules/jsonc-parser/package.json');
    expect(stdoutChunks.join('')).toContain('Packaged runtime surface passed.');
  });

  it('rethrows the spawn error when the pinned vsce process cannot start', () => {
    const spawnError = new Error('spawn ENOENT');
    expect(() =>
      auditPackagedRuntimeSurface(
        baseDeps({ spawnSync: () => ({ error: spawnError }), manifest: { dependencies: {} } })
      )
    ).toThrow(spawnError);
  });

  it('throws a bounded failure message when vsce ls exits non-zero', () => {
    expect(() =>
      auditPackagedRuntimeSurface(
        baseDeps({
          spawnSync: () => ({ status: 2, stdout: 'partial', stderr: 'boom' }),
          manifest: { dependencies: {} }
        })
      )
    ).toThrow(/vsce ls failed with exit code 2/u);
  });

  it('writes violations to stderr and throws when the packaged surface is dirty', () => {
    const stderrChunks: string[] = [];
    expect(() =>
      auditPackagedRuntimeSurface(
        baseDeps({
          spawnSync: () => ({
            status: 0,
            stdout: ['package.json', 'extension/node_modules/glob/package.json'].join('\n')
          }),
          manifest: { dependencies: { glob: '^13.0.6' } },
          stderr: { write: (chunk: string) => stderrChunks.push(chunk) }
        })
      )
    ).toThrow('Packaged runtime surface audit failed.');
    expect(stderrChunks.join('')).toContain('Unexpected runtime dependencies');
  });
});
