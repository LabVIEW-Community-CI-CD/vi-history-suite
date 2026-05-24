import { describe, expect, it } from 'vitest';

const {
  ALLOWED_RUNTIME_DEPENDENCIES,
  buildVsceFailureMessage,
  findRuntimeSurfaceViolations,
  parseVsceListOutput
} = require('../../scripts/auditPackagedRuntimeSurface.js') as {
  ALLOWED_RUNTIME_DEPENDENCIES: string[];
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
});
