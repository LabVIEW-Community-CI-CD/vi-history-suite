import * as fs from 'node:fs/promises';

import {
  detectViSignature,
  ViMagicOptions,
  ViSignature,
  VI_MAGIC_LENGTH,
  VI_MAGIC_OFFSET
} from './viMagicCore';

const MINIMUM_HEADER_LENGTH = VI_MAGIC_OFFSET + VI_MAGIC_LENGTH;

export async function readViProbeBytesFromFsPath(fsPath: string): Promise<Uint8Array> {
  const fileHandle = await fs.open(fsPath, 'r');
  try {
    const buffer = Buffer.alloc(MINIMUM_HEADER_LENGTH);
    const { bytesRead } = await fileHandle.read(buffer, 0, MINIMUM_HEADER_LENGTH, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export async function detectViSignatureFromFsPath(
  fsPath: string,
  options: ViMagicOptions = {}
): Promise<ViSignature | undefined> {
  try {
    return detectViSignature(await readViProbeBytesFromFsPath(fsPath), options);
  } catch {
    return undefined;
  }
}

