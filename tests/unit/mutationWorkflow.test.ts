import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

function readWorkflow(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', '.github', 'workflows', 'mutation.yml'), 'utf8')
    .replace(/\r\n/g, '\n');
}

function readStrykerConfig(): string {
  return fs
    .readFileSync(path.resolve(__dirname, '..', '..', 'stryker.config.mjs'), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('Mutation workflow (VHS-REQ-613)', () => {
  it('runs on a schedule and manual dispatch, never as a pull-request gate (VHS-REQ-613.9)', () => {
    const workflow = readWorkflow();

    expect(workflow).toContain('name: Mutation');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('cron:');
    expect(workflow).toContain('workflow_dispatch:');
    // Mutation is too slow to gate pull requests; it must stay scheduled/dispatch only.
    expect(workflow).not.toContain('pull_request');
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('runs the advisory mutation command and retains the report as run evidence (VHS-REQ-613.9)', () => {
    const workflow = readWorkflow();
    const strykerConfig = readStrykerConfig();

    expect(workflow).toContain('npm run test:mutation');
    expect(workflow).toContain('npm run requirements:verify');
    expect(workflow).toContain('name: Upload mutation report');
    expect(workflow).toContain('path: reports/mutation/');
    expect(strykerConfig).toContain("mutate: ['src/domain/**/*.ts']");
    expect(workflow.indexOf('run: npm run test:mutation')).toBeLessThan(
      workflow.indexOf('name: Upload mutation report')
    );
  });
});
