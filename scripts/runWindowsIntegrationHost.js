#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

function buildWindowsIntegrationCommand(env = process.env) {
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm run test:integration'],
    env: {
      ...env,
      VI_HISTORY_SUITE_INTEGRATION_HOST: 'windows'
    }
  };
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  if (argv.includes('--help') || argv.includes('-h')) {
    stdout.write('Usage: node scripts/runWindowsIntegrationHost.js\n');
    return;
  }

  const commandPlan = buildWindowsIntegrationCommand(process.env);
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
  buildWindowsIntegrationCommand,
  main
};
