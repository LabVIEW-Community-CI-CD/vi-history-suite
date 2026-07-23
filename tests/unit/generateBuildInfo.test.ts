import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const {
  UNKNOWN_COMMIT,
  formatShortCommit,
  generateBuildInfo,
  main
} = require('../../scripts/generateBuildInfo.js') as {
  UNKNOWN_COMMIT: string;
  formatShortCommit: (commit: string) => string;
  generateBuildInfo: (deps?: {
    repoRoot?: string;
    outDir?: string;
    getGitCommit?: () => string;
    getPackageVersion?: (repoRoot: string) => string;
    writeFile?: (path: string, content: string, encoding: string) => void;
    mkdirSync?: (path: string, options: { recursive: boolean }) => void;
  }) => { outputPath: string; buildInfo: { extensionVersion: string; extensionCommit: string } };
  main: (deps?: Record<string, unknown>) => number;
};

describe('generateBuildInfo script', () => {
  describe('formatShortCommit', () => {
    it('returns first 7 characters of a valid commit hash', () => {
      expect(formatShortCommit('505bb48f1b0c2e5a9d7c3a0b4e123456789abcde')).toBe('505bb48');
    });

    it('returns "unknown" for the unknown commit sentinel', () => {
      expect(formatShortCommit(UNKNOWN_COMMIT)).toBe('unknown');
    });
  });

  describe('generateBuildInfo', () => {
    it('generates build info with version and commit', () => {
      const writeFile = vi.fn();
      const mkdirSync = vi.fn();
      const repoRoot = '/mock/repo';
      const outDir = '/mock/repo/out';

      const result = generateBuildInfo({
        repoRoot,
        outDir,
        getGitCommit: () => '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde',
        getPackageVersion: () => '1.4.0',
        writeFile,
        mkdirSync
      });

      expect(result.outputPath).toBe(path.join(outDir, 'buildInfo.json'));
      expect(result.buildInfo).toEqual({
        extensionVersion: '1.4.0',
        extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde'
      });
      expect(mkdirSync).toHaveBeenCalledWith(outDir, { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        path.join(outDir, 'buildInfo.json'),
        JSON.stringify(
          {
            extensionVersion: '1.4.0',
            extensionCommit: '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde'
          },
          null,
          2
        ) + '\n',
        'utf8'
      );
    });

    it('uses unknown commit when git command fails', () => {
      const writeFile = vi.fn();
      const mkdirSync = vi.fn();

      const result = generateBuildInfo({
        repoRoot: '/mock/repo',
        outDir: '/mock/repo/out',
        getGitCommit: () => UNKNOWN_COMMIT,
        getPackageVersion: () => '2.0.0',
        writeFile,
        mkdirSync
      });

      expect(result.buildInfo).toEqual({
        extensionVersion: '2.0.0',
        extensionCommit: UNKNOWN_COMMIT
      });
    });
  });

  describe('main', () => {
    it('returns 0 on success and logs the output path', () => {
      const stdout = { write: vi.fn() };
      // Mock the script to run with injected dependencies
      const originalGenerateBuildInfo = require('../../scripts/generateBuildInfo.js').generateBuildInfo;

      // Since main() calls generateBuildInfo internally without deps,
      // we need to test the full flow if possible, or test that it handles errors
      // For now, we test the script integration through main
      const exitCode = main({ stdout });

      // The exit code should be 0 for success (when git is available)
      // or 0 with unknown commit (when git is not available)
      expect(exitCode).toBe(0);
      expect(stdout.write).toHaveBeenCalled();
    });
  });

  // #2331 branch coverage: the failure path (main catch) and the process.stdout
  // default. Every filesystem/git boundary is injected so no real git runs.
  describe('main failure + default-stream branches', () => {
    it('returns 1 and writes an Error message to stderr when generation throws an Error', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdout = { write: vi.fn() };
      const exitCode = main({
        stdout,
        repoRoot: '/mock/repo',
        outDir: path.join('/mock/repo', 'out'),
        getGitCommit: () => '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde',
        getPackageVersion: () => {
          throw new Error('boom-version');
        },
        writeFile: vi.fn(),
        mkdirSync: vi.fn()
      });
      expect(exitCode).toBe(1);
      expect(stdout.write).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('boom-version'));
      stderrSpy.mockRestore();
    });

    it('stringifies a non-Error throw on the failure path', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const exitCode = main({
        stdout: { write: vi.fn() },
        repoRoot: '/mock/repo',
        outDir: path.join('/mock/repo', 'out'),
        getGitCommit: () => 'abc1234',
        getPackageVersion: () => {
          // A thrown non-Error exercises the String(error) branch.
          // eslint-disable-next-line no-throw-literal
          throw 'plain-string-failure';
        },
        writeFile: vi.fn(),
        mkdirSync: vi.fn()
      });
      expect(exitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('plain-string-failure'));
      stderrSpy.mockRestore();
    });

    it('falls back to process.stdout when no stdout dep is supplied', () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const exitCode = main({
        repoRoot: '/mock/repo',
        outDir: path.join('/mock/repo', 'out'),
        getGitCommit: () => '505bb48f1b0c2e5a9d7c3a0b4e123456789abcde',
        getPackageVersion: () => '9.9.9',
        writeFile: vi.fn(),
        mkdirSync: vi.fn()
      });
      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('9.9.9+505bb48'));
      stdoutSpy.mockRestore();
    });
  });
});
