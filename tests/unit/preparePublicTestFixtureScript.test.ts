import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'preparePublicTestFixture.js');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const script = require(scriptPath) as {
  DEFAULT_BRANCH: string;
  DEFAULT_TARGET_ROOT: string;
  getUsage: () => string;
  getNextStepMessage: (targetRoot: string) => string;
  parseArgs: (argv: string[]) => {
    branch: string;
    targetRoot: string;
  };
};

describe('prepare public test fixture script', () => {
  it('defaults to the upstream develop branch and a visible sibling target path', () => {
    const parsed = script.parseArgs([]);
    const usage = script.getUsage();

    expect(script.DEFAULT_BRANCH).toBe('develop');
    expect(parsed.branch).toBe('develop');
    expect(path.basename(script.DEFAULT_TARGET_ROOT)).toBe('labview-icon-editor');
    expect(script.DEFAULT_TARGET_ROOT).not.toContain(`${path.sep}.cache${path.sep}`);
    expect(parsed.targetRoot).toBe(script.DEFAULT_TARGET_ROOT);
    expect(usage).toContain('branch:   develop');
    expect(usage).toContain(script.DEFAULT_TARGET_ROOT);
  });

  it('keeps the fixture helper on the full-history path and prints the next open-folder step', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    const nextStep = script.getNextStepMessage('/workspaces/labview-icon-editor');

    expect(source).not.toContain('--depth');
    expect(source).not.toContain('.cache/public-fixtures');
    expect(nextStep).toContain('File -> Open Folder...');
    expect(nextStep).toContain('/workspaces/labview-icon-editor');
  });
});
