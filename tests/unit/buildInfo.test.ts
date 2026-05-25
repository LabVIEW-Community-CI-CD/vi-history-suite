import { describe, expect, it, vi } from 'vitest';

import {
  readBuildInfo,
  UNKNOWN_COMMIT,
  UNKNOWN_SHORT_COMMIT,
  formatShortCommit,
  formatBuildRef
} from '../../src/tooling/buildInfo';

describe('buildInfo', () => {
  describe('formatShortCommit', () => {
    it('returns first 7 characters of a valid commit hash', () => {
      expect(formatShortCommit('505bb48f1b0c2e5a9d7c3a0b4e123456789abcde')).toBe('505bb48');
    });

    it('returns "unknown" for the unknown commit sentinel', () => {
      expect(formatShortCommit(UNKNOWN_COMMIT)).toBe(UNKNOWN_SHORT_COMMIT);
    });
  });

  describe('formatBuildRef', () => {
    it('creates a version+shortCommit format string', () => {
      expect(formatBuildRef('1.4.0', '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde')).toBe(
        '1.4.0+505bb48'
      );
    });

    it('creates a version+unknown format string for unknown commit', () => {
      expect(formatBuildRef('1.4.0', UNKNOWN_COMMIT)).toBe('1.4.0+unknown');
    });
  });

  describe('readBuildInfo', () => {
    it('reads valid build info from a JSON file', async () => {
      const mockFs = {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            extensionVersion: '1.4.0',
            extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde'
          })
        )
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '1.4.0',
        extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde',
        extensionBuildRef: '1.4.0+505bb48'
      });
    });

    it('falls back to package.json version when build info is missing', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockRejectedValueOnce(new Error('ENOENT'))
          .mockResolvedValueOnce(JSON.stringify({ version: '2.0.0' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '2.0.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '2.0.0+unknown'
      });
    });

    it('falls back to package.json version when build info is malformed JSON', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockResolvedValueOnce('not valid json')
          .mockResolvedValueOnce(JSON.stringify({ version: '2.1.0' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '2.1.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '2.1.0+unknown'
      });
    });

    it('falls back to package.json version when extensionVersion is missing from build info', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockResolvedValueOnce(
            JSON.stringify({
              extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde'
            })
          )
          .mockResolvedValueOnce(JSON.stringify({ version: '3.0.0' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '3.0.0',
        extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde',
        extensionBuildRef: '3.0.0+505bb48'
      });
    });

    it('uses unknown commit when extensionCommit is missing from build info', async () => {
      const mockFs = {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            extensionVersion: '1.5.0'
          })
        )
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '1.5.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '1.5.0+unknown'
      });
    });

    it('uses unknown commit when extensionCommit is empty string', async () => {
      const mockFs = {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            extensionVersion: '1.5.0',
            extensionCommit: '   '
          })
        )
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '1.5.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '1.5.0+unknown'
      });
    });

    it('uses unknown commit when extensionCommit is the unknown sentinel value', async () => {
      const mockFs = {
        readFile: vi.fn().mockResolvedValue(
          JSON.stringify({
            extensionVersion: '1.5.0',
            extensionCommit: '<unknown>'
          })
        )
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '1.5.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '1.5.0+unknown'
      });
    });

    it('falls back to version 0.0.0 when both build info and package.json fail', async () => {
      const mockFs = {
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT'))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '0.0.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '0.0.0+unknown'
      });
    });

    it('falls back to version 0.0.0 when package.json is malformed', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockRejectedValueOnce(new Error('ENOENT'))
          .mockResolvedValueOnce('not valid json')
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '0.0.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '0.0.0+unknown'
      });
    });

    it('falls back to version 0.0.0 when package.json has no version field', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockRejectedValueOnce(new Error('ENOENT'))
          .mockResolvedValueOnce(JSON.stringify({ name: 'test-package' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '0.0.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '0.0.0+unknown'
      });
    });

    it('handles build info with non-object data gracefully', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockResolvedValueOnce(JSON.stringify('just a string'))
          .mockResolvedValueOnce(JSON.stringify({ version: '4.0.0' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '4.0.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '4.0.0+unknown'
      });
    });

    it('handles build info with null data gracefully', async () => {
      const mockFs = {
        readFile: vi
          .fn()
          .mockResolvedValueOnce('null')
          .mockResolvedValueOnce(JSON.stringify({ version: '4.1.0' }))
      };

      const result = await readBuildInfo({
        fs: mockFs,
        buildInfoPath: '/mock/out/buildInfo.json',
        packageJsonPath: '/mock/package.json'
      });

      expect(result).toEqual({
        extensionVersion: '4.1.0',
        extensionCommit: UNKNOWN_COMMIT,
        extensionBuildRef: '4.1.0+unknown'
      });
    });
  });
});
