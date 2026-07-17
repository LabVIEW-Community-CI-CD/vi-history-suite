import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pathExistsViaFsAccess } from '../../src/support/fsExists';

describe('pathExistsViaFsAccess', () => {
  let tempDir: string;
  let existingFile: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vihs-fsexists-'));
    existingFile = path.join(tempDir, 'present.txt');
    await writeFile(existingFile, 'x', 'utf8');
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves true for an existing file', async () => {
    await expect(pathExistsViaFsAccess(existingFile)).resolves.toBe(true);
  });

  it('resolves true for an existing directory', async () => {
    await expect(pathExistsViaFsAccess(tempDir)).resolves.toBe(true);
  });

  it('resolves false for a missing path', async () => {
    await expect(
      pathExistsViaFsAccess(path.join(tempDir, 'missing.txt'))
    ).resolves.toBe(false);
  });
});
