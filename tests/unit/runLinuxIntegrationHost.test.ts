import { describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const integrationHost = require('../../scripts/runLinuxIntegrationHost.js') as {
  buildLinuxIntegrationCommand: (
    env?: Record<string, string | undefined>,
    deps?: { spawnSync?: typeof import('node:child_process').spawnSync }
  ) => { command: string; args: string[]; env: Record<string, string | undefined> };
  hasDisplay: (env?: Record<string, string | undefined>) => boolean;
};

describe('runLinuxIntegrationHost', () => {
  it('uses xvfb-run for Linux integration tests when no display is present and xvfb-run exists', () => {
    const command = integrationHost.buildLinuxIntegrationCommand(
      {},
      {
        spawnSync: vi.fn().mockReturnValue({ status: 0 }) as never
      }
    );

    expect(command.command).toBe('xvfb-run');
    expect(command.args).toEqual(['-a', 'npm', 'run', 'test:integration']);
    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_HOST).toBe('linux');
    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_XVFB_ACTIVE).toBe('1');
  });

  it('runs the integration host directly when a display is already available', () => {
    const command = integrationHost.buildLinuxIntegrationCommand(
      {
        DISPLAY: ':1'
      },
      {
        spawnSync: vi.fn().mockReturnValue({ status: 0 }) as never
      }
    );

    expect(integrationHost.hasDisplay({ DISPLAY: ':1' })).toBe(true);
    expect(command.command).toBe('npm');
    expect(command.args).toEqual(['run', 'test:integration']);
    expect(command.env.VI_HISTORY_SUITE_INTEGRATION_XVFB_ACTIVE).toBeUndefined();
  });

  it('runs the integration host directly when xvfb-run is unavailable', () => {
    const command = integrationHost.buildLinuxIntegrationCommand(
      {},
      {
        spawnSync: vi.fn().mockReturnValue({ status: 1 }) as never
      }
    );

    expect(command.command).toBe('npm');
    expect(command.args).toEqual(['run', 'test:integration']);
  });
});
