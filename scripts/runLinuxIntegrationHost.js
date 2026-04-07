#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function hasDisplay(env = process.env) {
  return Boolean((env.DISPLAY ?? '').trim() || (env.WAYLAND_DISPLAY ?? '').trim());
}

function hasCommand(command, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('bash', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    shell: false
  });
  return result.status === 0;
}

function buildLinuxIntegrationCommand(env = process.env, deps = {}) {
  const baseEnv = {
    ...env,
    VI_HISTORY_SUITE_INTEGRATION_HOST: 'linux'
  };
  const useXvfb =
    !hasDisplay(baseEnv) &&
    !baseEnv.VI_HISTORY_SUITE_INTEGRATION_XVFB_ACTIVE &&
    hasCommand('xvfb-run', deps.spawnSync);

  if (useXvfb) {
    return {
      command: 'xvfb-run',
      args: ['-a', 'npm', 'run', 'test:integration'],
      env: {
        ...baseEnv,
        VI_HISTORY_SUITE_INTEGRATION_XVFB_ACTIVE: '1'
      }
    };
  }

  return {
    command: 'npm',
    args: ['run', 'test:integration'],
    env: baseEnv
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  if (argv.includes('--help') || argv.includes('-h')) {
    stdout.write('Usage: node scripts/runLinuxIntegrationHost.js\n');
    return;
  }

  const commandPlan = buildLinuxIntegrationCommand(process.env, deps);
  const result = (deps.spawnSync ?? spawnSync)(commandPlan.command, commandPlan.args, {
    cwd: deps.cwd ?? process.cwd(),
    env: commandPlan.env,
    stdio: 'inherit',
    shell: false
  });

  if (result.error) {
    throw result.error;
  }
  process.exitCode = typeof result.status === 'number' ? result.status : 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildLinuxIntegrationCommand,
  hasCommand,
  hasDisplay,
  main
};
