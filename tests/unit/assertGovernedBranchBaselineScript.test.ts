import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const scriptPath = path.resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'assertGovernedBranchBaseline.js'
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require(scriptPath) as {
  assertGovernedBranchBaseline: (
    options: { repoRoot: string; mainRef: string; developRef: string },
    deps?: { spawnImpl?: typeof vi.fn }
  ) => {
    mainSha: string;
    developSha: string;
  };
  getUsage: () => string;
  parseArgs: (argv: string[]) => {
    helpRequested: boolean;
    repoRoot: string;
    mainRef: string;
    developRef: string;
  };
};

describe('assert governed branch baseline script', () => {
  it('parses the CLI contract and exposes the default refs', () => {
    expect(script.parseArgs([])).toMatchObject({
      helpRequested: false,
      mainRef: 'origin/main',
      developRef: 'origin/develop'
    });
    expect(script.getUsage()).toContain('--main-ref <ref>');
    expect(script.getUsage()).toContain('origin/main');
    expect(script.getUsage()).toContain('origin/develop');
  });

  it('passes when develop already contains main', () => {
    const spawnImpl = vi.fn((command: string, args: string[]) => {
      expect(command).toBe('git');

      if (args[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: args.at(-1) === 'origin/main' ? 'mainsha\n' : 'developsha\n',
          stderr: ''
        };
      }

      return {
        status: 0,
        stdout: '',
        stderr: ''
      };
    });

    expect(
      script.assertGovernedBranchBaseline(
        {
          repoRoot: '/tmp/vi-history-suite',
          mainRef: 'origin/main',
          developRef: 'origin/develop'
        },
        { spawnImpl }
      )
    ).toMatchObject({
      mainSha: 'mainsha',
      developSha: 'developsha'
    });
  });

  it('fails closed when develop does not yet contain main', () => {
    const spawnImpl = vi.fn((command: string, args: string[]) => {
      expect(command).toBe('git');

      if (args[0] === 'rev-parse') {
        return {
          status: 0,
          stdout: 'sha\n',
          stderr: ''
        };
      }

      return {
        status: 1,
        stdout: '',
        stderr: ''
      };
    });

    expect(() =>
      script.assertGovernedBranchBaseline(
        {
          repoRoot: '/tmp/vi-history-suite',
          mainRef: 'origin/main',
          developRef: 'origin/develop'
        },
        { spawnImpl }
      )
    ).toThrow('does not yet contain');
  });
});
