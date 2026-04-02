import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readFileMock, readViProbeBytesFromFsPathMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  readViProbeBytesFromFsPathMock: vi.fn()
}));

vi.mock('vscode', () => ({
  workspace: {
    fs: {
      readFile: readFileMock
    }
  }
}));

vi.mock('../../src/domain/viFile', async () => {
  const actual = await vi.importActual<typeof import('../../src/domain/viFile')>(
    '../../src/domain/viFile'
  );
  return {
    ...actual,
    readViProbeBytesFromFsPath: readViProbeBytesFromFsPathMock
  };
});

import {
  detectViSignatureFromUri,
  isLabviewViByMagic,
  readViProbeBytes
} from '../../src/domain/viMagic';
import { VI_MAGIC_LENGTH, VI_MAGIC_OFFSET } from '../../src/domain/viMagicCore';

const MINIMUM_HEADER_LENGTH = VI_MAGIC_OFFSET + VI_MAGIC_LENGTH;

describe('viMagic URI wrapper', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    readViProbeBytesFromFsPathMock.mockReset();
  });

  it('delegates file URIs to the file-system probe helper', async () => {
    readViProbeBytesFromFsPathMock.mockResolvedValue(
      new Uint8Array(Buffer.from('RSRC\r\n\x00\x03LVIN', 'binary'))
    );

    await expect(
      readViProbeBytes({
        scheme: 'file',
        fsPath: '/workspace/sample.vi'
      } as never)
    ).resolves.toEqual(new Uint8Array(Buffer.from('RSRC\r\n\x00\x03LVIN', 'binary')));

    expect(readViProbeBytesFromFsPathMock).toHaveBeenCalledWith('/workspace/sample.vi');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('truncates non-file workspace reads to the minimum detection header length', async () => {
    readFileMock.mockResolvedValue(
      new Uint8Array(Buffer.from('RSRC\r\n\x00\x03LVINEXTRA-BYTES', 'binary'))
    );

    const bytes = await readViProbeBytes({
      scheme: 'vscode-remote',
      fsPath: '/workspace/sample.vi'
    } as never);

    expect(bytes).toHaveLength(MINIMUM_HEADER_LENGTH);
    expect(Buffer.from(bytes).toString('binary')).toBe('RSRC\r\n\x00\x03LVIN');
    expect(readViProbeBytesFromFsPathMock).not.toHaveBeenCalled();
  });

  it('fails closed to undefined and false when wrapper probe reads throw', async () => {
    readViProbeBytesFromFsPathMock.mockRejectedValue(new Error('read failed'));

    await expect(
      detectViSignatureFromUri({
        scheme: 'file',
        fsPath: '/workspace/sample.vi'
      } as never)
    ).resolves.toBeUndefined();

    await expect(
      isLabviewViByMagic({
        scheme: 'file',
        fsPath: '/workspace/sample.vi'
      } as never)
    ).resolves.toBe(false);
  });
});
