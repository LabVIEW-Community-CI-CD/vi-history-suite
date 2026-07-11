import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  detectViSignatureFromFsPath,
  readViProbeBytesFromFsPath
} from '../../src/domain/viFile';

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-vi-file-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0, tempDirectories.length).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('viFile', () => {
  it('returns only the bytes actually read up to the minimum header length (VHS-REQ-010)', async () => {
    const tempRoot = await createTempDirectory();
    const shortFile = path.join(tempRoot, 'short.bin');
    const longFile = path.join(tempRoot, 'long.vi');
    const longBuffer = Buffer.concat([
      Buffer.from('RSRC\r\n\x00\x03', 'binary'),
      Buffer.from('LVIN', 'ascii'),
      Buffer.from('payload beyond probe window', 'utf8')
    ]);

    await fs.writeFile(shortFile, Buffer.from([1, 2, 3, 4, 5]));
    await fs.writeFile(longFile, longBuffer);

    const shortProbe = await readViProbeBytesFromFsPath(shortFile);
    const longProbe = await readViProbeBytesFromFsPath(longFile);

    expect(Array.from(shortProbe)).toEqual([1, 2, 3, 4, 5]);
    expect(Buffer.from(longProbe)).toEqual(longBuffer.subarray(0, 12));
  });

  it('fails closed to undefined when the filesystem signature probe cannot be completed (VHS-REQ-010)', async () => {
    await expect(
      detectViSignatureFromFsPath('/tmp/vi-history-suite-missing-file.vi', {
        strictRsrcHeader: true
      })
    ).resolves.toBeUndefined();
  });
});
