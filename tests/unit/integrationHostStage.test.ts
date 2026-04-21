import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  INTEGRATION_HOST_STAGE_ENTRIES,
  resolveIntegrationHostStageEntries,
  stageExtensionForWindowsHost
} from '../../src/tooling/integrationHostStage';

describe('integrationHostStage', () => {
  it('adds governed runtime dependencies to the Windows host staging entry list', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-stage-list-'));

    try {
      await fs.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify(
          {
            name: 'vi-history-suite',
            dependencies: {
              'jsonc-parser': '^3.3.1'
            }
          },
          null,
          2
        ) + '\n',
        'utf8'
      );

      await expect(resolveIntegrationHostStageEntries(repoRoot)).resolves.toEqual([
        'package.json',
        'out',
        'out-tests',
        'resources',
        path.join('node_modules', 'jsonc-parser')
      ]);
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('stages all required extension entries for the Windows extension host', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-stage-src-'));
    const stageBase = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-stage-dst-'));

    try {
      await fs.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify(
          {
            name: 'vi-history-suite',
            dependencies: {
              'jsonc-parser': '^3.3.1'
            }
          },
          null,
          2
        ) + '\n',
        'utf8'
      );
      await fs.mkdir(path.join(repoRoot, 'out'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'out', 'extension.js'), 'exports.activate = () => {};\n', 'utf8');
      await fs.mkdir(path.join(repoRoot, 'out-tests'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'out-tests', 'suite.js'), 'exports.run = () => {};\n', 'utf8');
      await fs.mkdir(path.join(repoRoot, 'node_modules', 'jsonc-parser'), { recursive: true });
      await fs.writeFile(
        path.join(repoRoot, 'node_modules', 'jsonc-parser', 'index.js'),
        'exports.parse = () => ({});\n',
        'utf8'
      );
      await fs.mkdir(path.join(repoRoot, 'resources', 'bundled-docs', 'pages'), { recursive: true });
      await fs.writeFile(
        path.join(repoRoot, 'resources', 'bundled-docs', 'manifest.json'),
        '{"pages":[]}\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(repoRoot, 'resources', 'bundled-docs', 'pages', 'overview.html'),
        '<h1>Overview</h1>\n',
        'utf8'
      );

      const stagedRoot = await stageExtensionForWindowsHost(repoRoot, stageBase);

      expect(INTEGRATION_HOST_STAGE_ENTRIES).toEqual([
        'package.json',
        'out',
        'out-tests',
        'resources'
      ]);
      await expect(fs.readFile(path.join(stagedRoot, 'package.json'), 'utf8')).resolves.toContain(
        '"name": "vi-history-suite"'
      );
      await expect(fs.readFile(path.join(stagedRoot, 'out', 'extension.js'), 'utf8')).resolves.toContain(
        'activate'
      );
      await expect(fs.readFile(path.join(stagedRoot, 'out-tests', 'suite.js'), 'utf8')).resolves.toContain(
        'run'
      );
      await expect(
        fs.readFile(path.join(stagedRoot, 'node_modules', 'jsonc-parser', 'index.js'), 'utf8')
      ).resolves.toContain('exports.parse');
      await expect(
        fs.readFile(path.join(stagedRoot, 'resources', 'bundled-docs', 'manifest.json'), 'utf8')
      ).resolves.toContain('"pages":[]');
      await expect(
        fs.readFile(
          path.join(stagedRoot, 'resources', 'bundled-docs', 'pages', 'overview.html'),
          'utf8'
        )
      ).resolves.toContain('<h1>Overview</h1>');
    } finally {
      await fs.rm(repoRoot, { recursive: true, force: true });
      await fs.rm(stageBase, { recursive: true, force: true });
    }
  });
});
