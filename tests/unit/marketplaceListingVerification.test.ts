import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const {
  listingContainsVersion,
  verifyMarketplaceListing
} = require('../../scripts/verifyMarketplaceListing.js') as {
  listingContainsVersion: (payload: { versions?: Array<{ version: string }> }, version: string) => boolean;
  verifyMarketplaceListing: (
    options: {
      extensionId: string;
      expectedVersion: string;
      out?: string;
      attempts: number;
      delayMs: number;
    },
    deps: {
      platform?: string;
      spawnSync?: (
        command: string,
        args: string[],
        options: { cwd?: string; encoding?: string; shell?: boolean }
      ) => { status?: number | null; stdout?: string; stderr?: string; error?: Error };
      sleepSync?: (ms: number) => void;
    }
  ) => { success: boolean; message: string; attempts: Array<{ outcome: string }> };
};

function payload(version: string): string {
  return JSON.stringify({ versions: [{ version }] });
}

describe('Marketplace listing verification', () => {
  it('detects the expected version in a Marketplace payload', () => {
    expect(listingContainsVersion({ versions: [{ version: '1.4.2' }] }, '1.4.2')).toBe(true);
    expect(listingContainsVersion({ versions: [{ version: '1.4.1' }] }, '1.4.2')).toBe(false);
  });

  it('passes immediately and writes the retained evidence file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vihs-marketplace-'));
    const out = path.join(tempDir, 'marketplace-show.json');
    const spawnSync = vi.fn(() => ({ status: 0, stdout: payload('1.4.2') }));

    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        out,
        attempts: 6,
        delayMs: 1
      },
      { spawnSync, sleepSync: vi.fn() }
    );

    expect(result.success).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].outcome).toBe('version-found');
    expect(JSON.parse(fs.readFileSync(out, 'utf8')).versions[0].version).toBe('1.4.2');
  });

  it('retries absent versions and then succeeds', () => {
    const sleepSync = vi.fn();
    const spawnSync = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: payload('1.4.1') })
      .mockReturnValueOnce({ status: 0, stdout: payload('1.4.2') });

    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 2,
        delayMs: 10
      },
      { spawnSync, sleepSync }
    );

    expect(result.success).toBe(true);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      'version-absent',
      'version-found'
    ]);
    expect(sleepSync).toHaveBeenCalledWith(10);
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
      { spawnSync, sleepSync: vi.fn() }
    );

    expect(result.success).toBe(false);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      'malformed-json',
      'show-failed'
    ]);
    expect(result.message).toContain('Marketplace propagation lag or absent publication');
  });

  it('fails with propagation-lag wording after exhausted retries', () => {
    const result = verifyMarketplaceListing(
      {
        extensionId: 'svelderrainruiz.vi-history-suite',
        expectedVersion: '1.4.2',
        attempts: 2,
        delayMs: 0
      },
      {
        spawnSync: vi.fn(() => ({ status: 0, stdout: payload('1.4.1') })),
        sleepSync: vi.fn()
      }
    );

    expect(result.success).toBe(false);
    expect(result.attempts).toHaveLength(2);
    expect(result.message).toContain('after 2 attempts');
    expect(result.message).toContain('Marketplace propagation lag');
  });
});
