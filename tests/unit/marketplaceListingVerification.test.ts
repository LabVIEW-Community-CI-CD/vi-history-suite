import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  buildVerificationReport,
  listingContainsVersion,
  main,
  parseArgs,
  parseMarketplaceShow,
  runVsceShow,
  verifyMarketplaceListing
} = require('../../scripts/verifyMarketplaceListing.js') as {
  buildVerificationReport: (
    options: {
      extensionId: string;
      expectedVersion: string;
      attempts: number;
      delayMs: number;
    },
    result: { success: boolean; message: string; attempts: Array<{ outcome: string }>; boundedWindowMs?: number }
  ) => {
    boundedWindowMs: number;
    configuredAttempts: number;
    configuredDelayMs: number;
    attempts: Array<{ outcome: string }>;
  };
  listingContainsVersion: (
    payload: { versions?: Array<{ version?: string } | null | undefined> },
    version: string
  ) => boolean;
  main: (argv?: string[], deps?: MarketplaceDeps) => number;
  parseArgs: (argv: string[]) => {
    extensionId: string;
    expectedVersion: string;
    out?: string;
    reportOut?: string;
    attempts: number;
    delayMs: number;
    help?: boolean;
  };
  parseMarketplaceShow: (stdout: string) => {
    payload: { versions?: Array<{ version?: string }> };
    versions: Array<{ version?: string }>;
  };
  runVsceShow: (extensionId: string, deps?: MarketplaceDeps) => {
    command: string;
    status: number;
    stdout: string;
    stderr: string;
    error: string;
  };
  verifyMarketplaceListing: (
    options: {
      extensionId: string;
      expectedVersion: string;
      out?: string;
      attempts: number;
      delayMs: number;
    },
    deps: MarketplaceDeps
  ) => {
    success: boolean;
    message: string;
    attempts: Array<{ outcome: string; message: string }>;
    payload?: { versions?: Array<{ version?: string }> };
    boundedWindowMs?: number;
  };
};

type MarketplaceDeps = {
  cwd?: string;
  execPath?: string;
  platform?: string;
  spawnSync?: (
    command: string,
    args: string[],
    options: { cwd?: string; encoding?: string; shell?: boolean }
  ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error; signal?: string | null };
  sleepSync?: (ms: number) => void;
  vsceCliPath?: string;
};

const tempRoots: string[] = [];

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-marketplace-'));
  tempRoots.push(tempDir);
  return tempDir;
}

function payload(version: string): string {
  return JSON.stringify({ versions: [{ version }] });
}

function mockVsceDeps(
  spawnSync: MarketplaceDeps['spawnSync'],
  overrides: Partial<MarketplaceDeps> = {}
): MarketplaceDeps {
  return {
    execPath: 'node-test',
    spawnSync,
    vsceCliPath: path.join('tools', 'vsce.js'),
    ...overrides
  };
}

describe('Marketplace listing verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects the expected version in a Marketplace payload', () => {
    expect(listingContainsVersion({ versions: [{ version: '1.4.2' }] }, '1.4.2')).toBe(true);
    expect(listingContainsVersion({ versions: [{ version: '1.4.1' }] }, '1.4.2')).toBe(false);
    expect(
      listingContainsVersion({ versions: [null, undefined, { version: undefined }] }, '1.4.2')
    ).toBe(false);
    expect(listingContainsVersion({}, '1.4.2')).toBe(false);
  });

  it('parses Marketplace show JSON and normalizes missing versions', () => {
    expect(parseMarketplaceShow(payload('1.4.2')).versions).toEqual([{ version: '1.4.2' }]);
    expect(parseMarketplaceShow('{}').versions).toEqual([]);
    expect(parseMarketplaceShow('{"versions":"not-an-array"}').versions).toEqual([]);
    expect(() => parseMarketplaceShow('{not json')).toThrow();
  });

  it('parses optional retained report output path', () => {
    const options = parseArgs([
      'svelderrainruiz.vi-history-suite',
      '1.4.2',
      '--out',
      'release-evidence/marketplace-show.json',
      '--report-out',
      'release-evidence/marketplace-listing-verification.json',
      '--attempts',
      '6',
      '--delay-ms',
      '30000'
    ]);

    expect(options.reportOut).toBe('release-evidence/marketplace-listing-verification.json');
    expect(options.attempts).toBe(6);
    expect(options.delayMs).toBe(30000);
  });

  it('parses help flags after positional arguments', () => {
    expect(parseArgs(['publisher.extension', '1.4.2', '--help']).help).toBe(true);
    expect(parseArgs(['publisher.extension', '1.4.2', '-h']).help).toBe(true);
  });

  it('rejects missing required arguments and unknown options', () => {
    expect(() => parseArgs([])).toThrow('extension id and expected version are required');
    expect(() => parseArgs(['publisher.extension'])).toThrow(
      'extension id and expected version are required'
    );
    expect(() => parseArgs(['publisher.extension', '1.4.2', '--mystery'])).toThrow(
      'Unknown argument: --mystery'
    );
  });

  it.each(['--out', '--report-out', '--attempts', '--delay-ms'])(
    'rejects missing values for %s',
    (option) => {
      expect(() => parseArgs(['publisher.extension', '1.4.2', option])).toThrow(
        `${option} requires a value`
      );
      expect(() => parseArgs(['publisher.extension', '1.4.2', option, '--help'])).toThrow(
        `${option} requires a value`
      );
    }
  );

  it.each([
    ['0', '--attempts must be a positive integer'],
    ['1.5', '--attempts must be a positive integer'],
    ['not-a-number', '--attempts must be a positive integer']
  ])('rejects invalid attempt count %s', (attempts, message) => {
    expect(() => parseArgs(['publisher.extension', '1.4.2', '--attempts', attempts])).toThrow(
      message
    );
  });

  it.each([
    ['-1', '--delay-ms must be a non-negative number'],
    ['not-a-number', '--delay-ms must be a non-negative number']
  ])('rejects invalid delay %s', (delayMs, message) => {
    expect(() => parseArgs(['publisher.extension', '1.4.2', '--delay-ms', delayMs])).toThrow(
      message
    );
  });

  it('runs pinned vsce show with cwd pass-through and status fallbacks', () => {
    const cwd = path.join('workspace', 'repo');
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ error: new Error('spawn failed') })
      .mockReturnValueOnce({ status: null, signal: 'SIGTERM' });

    const failed = runVsceShow('publisher.extension', mockVsceDeps(spawnSync, { cwd }));
    const signaled = runVsceShow('publisher.extension', mockVsceDeps(spawnSync, { cwd }));

    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'node-test',
      [path.join('tools', 'vsce.js'), 'show', 'publisher.extension', '--json'],
      { cwd, encoding: 'utf8', shell: false }
    );
    expect(failed).toMatchObject({ status: 1, stdout: '', stderr: '', error: 'spawn failed' });
    expect(failed.command).toContain('show publisher.extension --json');
    expect(signaled).toMatchObject({ status: 1, stdout: '', stderr: '', error: 'terminated by signal SIGTERM' });
  });

  it('passes immediately and writes the retained evidence file', () => {
    const tempDir = createTempDir();
    const out = path.join(tempDir, 'nested', 'marketplace-show.json');
    const spawnSync = vi.fn(() => ({ status: 0, stdout: payload('1.4.2') }));
    const sleepSync = vi.fn();

    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        out,
        attempts: 6,
        delayMs: 1
      },
      mockVsceDeps(spawnSync, { sleepSync })
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].outcome).toBe('version-found');
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).versions[0].version).toBe('1.4.2');
    expect(sleepSync).not.toHaveBeenCalled();
  });

  it('retries bounded propagation lag and retains final listing evidence (VHS-REQ-609.8)', () => {
    const tempDir = createTempDir();
    const out = path.join(tempDir, 'evidence', 'marketplace-show.json');
    const sleepSync = vi.fn();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: payload('1.4.1') })
      .mockReturnValueOnce({ status: 0, stdout: payload('1.4.0') })
      .mockReturnValueOnce({ status: 0, stdout: payload('1.4.2') });

    const options = {
      extensionId: 'svelderrainruiz.vi-history-suite',
      expectedVersion: '1.4.2',
      out,
      attempts: 3,
      delayMs: 10
    };
    const result = verifyMarketplaceListing(
      options,
      mockVsceDeps(spawnSync, { sleepSync })
    );
    const report = buildVerificationReport(options, result);

    expect(result.success).toBe(true);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      'version-absent',
      'version-absent',
      'version-found'
    ]);
    expect(result.boundedWindowMs).toBe(20);
    expect(report.boundedWindowMs).toBe(20);
    expect(report.attempts).toHaveLength(3);
    expect(sleepSync).toHaveBeenCalledTimes(2);
    expect(sleepSync).toHaveBeenNthCalledWith(1, 10);
    expect(sleepSync).toHaveBeenNthCalledWith(2, 10);
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).versions[0].version).toBe('1.4.2');
  });

  it('records malformed JSON and command failure as retryable attempts', () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: '{not json' })
      .mockReturnValueOnce({ status: 1, stderr: 'network unavailable' });

    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 2,
        delayMs: 0
      },
      mockVsceDeps(spawnSync, { sleepSync: vi.fn() })
    );

    expect(result.success).toBe(false);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      'malformed-json',
      'show-failed'
    ]);
    expect(result.attempts[0].message).toContain('could not be parsed');
    expect(result.attempts[1].message).toBe('network unavailable');
    expect(result.message).toContain('Marketplace propagation lag or absent publication');
  });

  it('uses stderr, error, and status fallback messages for show failures', () => {
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 1, stderr: 'transient network failure' })
      .mockReturnValueOnce({ error: new Error('spawn unavailable') })
      .mockReturnValueOnce({ status: 7 });

    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 3,
        delayMs: 0
      },
      mockVsceDeps(spawnSync, { sleepSync: vi.fn() })
    );

    expect(result.success).toBe(false);
    expect(result.attempts.map((attempt) => attempt.message)).toEqual([
      'transient network failure',
      'spawn unavailable',
      'vsce show exited with 7'
    ]);
  });

  it('fails with propagation-lag wording after exhausted retries', () => {
    const sleepSync = vi.fn();
    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 2,
        delayMs: 0
      },
      {
        spawnSync: vi.fn(() => ({ status: 0, stdout: payload('1.4.1') })),
        sleepSync,
        vsceCliPath: path.join('tools', 'vsce.js'),
        execPath: 'node-test'
      }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(result.message).toContain('after 2 attempts');
    expect(result.message).toContain('Marketplace propagation lag');
    expect(sleepSync).toHaveBeenCalledTimes(1);
  });

  it('builds a bounded verification report payload for retained evidence', () => {
    const report = buildVerificationReport(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 6,
        delayMs: 30000
      },
      {
        success: false,
        message: 'not found',
        attempts: [{ outcome: 'version-absent' }]
      }
    );

    expect(report.configuredAttempts).toBe(6);
    expect(report.configuredDelayMs).toBe(30000);
    expect(report.boundedWindowMs).toBe(150000);
    expect(report.attempts[0].outcome).toBe('version-absent');
  });

  it('keeps the result bounded window when present in the verification result', () => {
    const report = buildVerificationReport(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 6,
        delayMs: 30000
      },
      {
        success: true,
        message: 'found',
        boundedWindowMs: 12345,
        attempts: [{ outcome: 'version-found' }]
      }
    );

    expect(report.boundedWindowMs).toBe(12345);
  });

  it('main writes usage to stdout for help and returns success', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const exitCode = main(['publisher.extension', '1.4.2', '--help']);

    expect(exitCode).toBe(0);
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('Usage: node scripts/verifyMarketplaceListing.js')
    );
  });

  it('main writes a retained report and stdout on success', () => {
    const tempDir = createTempDir();
    const reportOut = path.join(tempDir, 'reports', 'marketplace-listing-verification.json');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const spawnSync = vi.fn(() => ({ status: 0, stdout: payload('1.4.2') }));

    const exitCode = main(
      [
        'svelderrainruiz.vi-history-suite',
        '1.4.2',
        '--report-out',
        reportOut
      ],
      mockVsceDeps(spawnSync, { sleepSync: vi.fn() })
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(reportOut, 'utf8'))).toMatchObject({
      success: true,
      configuredAttempts: 1,
      boundedWindowMs: 0
    });
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('Marketplace listing contains version 1.4.2.')
    );
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('main writes a retained report and stdout on verification failure', () => {
    const tempDir = createTempDir();
    const reportOut = path.join(tempDir, 'reports', 'marketplace-listing-verification.json');
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const spawnSync = vi.fn(() => ({ status: 0, stdout: payload('1.4.1') }));

    const exitCode = main(
      [
        'svelderrainruiz.vi-history-suite',
        '1.4.2',
        '--report-out',
        reportOut
      ],
      mockVsceDeps(spawnSync, { sleepSync: vi.fn() })
    );

    expect(exitCode).toBe(1);
    expect(JSON.parse(fs.readFileSync(reportOut, 'utf8'))).toMatchObject({
      success: false,
      attempts: [expect.objectContaining({ outcome: 'version-absent' })]
    });
    expect(stdoutWrite).toHaveBeenCalledWith(
      expect.stringContaining('Marketplace listing verification did not find version 1.4.2')
    );
    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('main writes parse errors and usage to stderr', () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const exitCode = main(['svelderrainruiz.vi-history-suite', '1.4.2', '--attempts', '0']);

    expect(exitCode).toBe(1);
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('--attempts must be a positive integer')
    );
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
