import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  INTEGRATION_HOST_STAGE_ENTRIES,
  resolveIntegrationHostStageEntries,
  stageExtensionForWindowsHost
} from '../../src/tooling/integrationHostStage';

describe('integrationHostStage (VHS-REQ-685.1)', () => {
  const tempRoots: string[] = [];

  async function makeTempDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop();
      if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
      }
    }
  });

  describe('resolveIntegrationHostStageEntries', () => {
    it('appends a node_modules path for every runtime dependency after the fixed entries', async () => {
      const repoRoot = await makeTempDir('vihs-stage-entries-deps-');
      await fs.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify({ name: 'fixture', dependencies: { alpha: '1.0.0', beta: '^2.0.0' } }),
        'utf8'
      );

      const entries = await resolveIntegrationHostStageEntries(repoRoot);

      expect(entries).toEqual([
        ...INTEGRATION_HOST_STAGE_ENTRIES,
        path.join('node_modules', 'alpha'),
        path.join('node_modules', 'beta')
      ]);
    });

    it('returns only the fixed entries when the manifest declares no dependencies', async () => {
      const repoRoot = await makeTempDir('vihs-stage-entries-nodeps-');
      await fs.writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify({ name: 'fixture' }),
        'utf8'
      );

      const entries = await resolveIntegrationHostStageEntries(repoRoot);

      expect(entries).toEqual([...INTEGRATION_HOST_STAGE_ENTRIES]);
    });
  });

  describe('stageExtensionForWindowsHost', () => {
    it('creates a prefixed stage directory and recursively copies every staged entry', async () => {
      const repoRoot = await makeTempDir('vihs-stage-src-');
      const baseDirectory = await makeTempDir('vihs-stage-base-');

      const manifest = JSON.stringify({ name: 'fixture' });
      await fs.writeFile(path.join(repoRoot, 'package.json'), manifest, 'utf8');
      await fs.mkdir(path.join(repoRoot, 'out', 'sub'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'out', 'main.js'), 'out-main', 'utf8');
      await fs.writeFile(path.join(repoRoot, 'out', 'sub', 'nested.js'), 'out-nested', 'utf8');
      await fs.mkdir(path.join(repoRoot, 'out-tests'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'out-tests', 'spec.js'), 'tests-spec', 'utf8');
      await fs.mkdir(path.join(repoRoot, 'resources'), { recursive: true });
      await fs.writeFile(path.join(repoRoot, 'resources', 'asset.txt'), 'resource-asset', 'utf8');

      const stageRoot = await stageExtensionForWindowsHost(repoRoot, baseDirectory);

      expect(path.dirname(stageRoot)).toBe(baseDirectory);
      expect(path.basename(stageRoot).startsWith('vihs-ext-host-')).toBe(true);

      // File branch of copyRecursive.
      expect(await fs.readFile(path.join(stageRoot, 'package.json'), 'utf8')).toBe(manifest);
      // Directory branch plus nested-directory recursion.
      expect(await fs.readFile(path.join(stageRoot, 'out', 'main.js'), 'utf8')).toBe('out-main');
      expect(await fs.readFile(path.join(stageRoot, 'out', 'sub', 'nested.js'), 'utf8')).toBe(
        'out-nested'
      );
      expect(await fs.readFile(path.join(stageRoot, 'out-tests', 'spec.js'), 'utf8')).toBe(
        'tests-spec'
      );
      expect(await fs.readFile(path.join(stageRoot, 'resources', 'asset.txt'), 'utf8')).toBe(
        'resource-asset'
      );
    });
  });
});
