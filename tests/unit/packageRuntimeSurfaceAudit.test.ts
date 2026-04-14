import { describe, expect, it } from 'vitest';

const {
  GOVERNED_RUNTIME_DEPENDENCIES,
  findRuntimeSurfaceViolations,
  parseVsceListOutput
} = require('../../scripts/auditPackagedRuntimeSurface.js') as {
  GOVERNED_RUNTIME_DEPENDENCIES: string[];
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
      'Ungoverned runtime dependencies are not allowed in package.json: glob',
      'Packaged VSIX surface includes forbidden runtime paths: extension/node_modules/glob/package.json, .vscode-test/vscode-linux-x64/resources/app/node_modules.asar',
      'Packaged VSIX surface includes forbidden package payloads: extension/node_modules/glob/package.json'
    ]);
  });

  it('fails closed when a governed runtime dependency is declared but not packaged', () => {
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
      'Packaged VSIX surface is missing governed runtime dependency payloads: jsonc-parser'
    ]);
  });

  it('passes for the current governed runtime package surface', () => {
    expect(GOVERNED_RUNTIME_DEPENDENCIES).toEqual(['jsonc-parser']);
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
