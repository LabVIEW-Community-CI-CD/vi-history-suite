import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const integrationHost = require('../../scripts/runWindowsIntegrationHost.js') as {
  buildWindowsIntegrationCommand: (
    env?: Record<string, string | undefined>
  ) => { command: string; args: string[]; env: Record<string, string | undefined> };
  main: (
    argv?: string[],
    deps?: {
      spawnSync?: typeof import('node:child_process').spawnSync;
      stdout?: { write: (chunk: string) => void };
      cwd?: string;
    }
  ) => void;
};

describe('runWindowsIntegrationHost (VHS-REQ-684.4)', () => {
  it('launches the integration suite through cmd.exe with the windows host marker env', () => {
    const command = integrationHost.buildWindowsIntegrationCommand({ EXISTING: 'kept' });

    expect(command.command).toBe('cmd.exe');
    expect(command.args).toEqual(['/d', '/s', '/c', 'npm run test:integration']);
    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_HOST).toBe('windows');
    // The caller-provided environment is preserved alongside the marker.
    expect(command.env.EXISTING).toBe('kept');
  });

  it('prints usage and does not spawn when --help is passed', () => {
    const spawnSync = vi.fn();
    const writes: string[] = [];

    integrationHost.main(['--help'], {
      spawnSync: spawnSync as never,
      stdout: { write: (chunk: string) => writes.push(chunk) }
    });

    expect(spawnSync).not.toHaveBeenCalled();
    expect(writes.join('')).toContain('Usage: node scripts/runWindowsIntegrationHost.js');
  });

  it('propagates the child process exit status as the process exit code', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 7 });
    const previousExitCode = process.exitCode;

    try {
      integrationHost.main([], { spawnSync: spawnSync as never, cwd: '/work' });

      expect(spawnSync).toHaveBeenCalledTimes(1);
      const [command, args] = spawnSync.mock.calls[0] as [string, string[]];
      expect(command).toBe('cmd.exe');
      expect(args).toEqual(['/d', '/s', '/c', 'npm run test:integration']);
      expect(process.exitCode).toBe(7);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('rethrows a spawn error so the launch fails closed', () => {
    const spawnSync = vi.fn().mockReturnValue({ error: new Error('spawn failed') });

    expect(() => integrationHost.main([], { spawnSync: spawnSync as never })).toThrow('spawn failed');
  });
});
