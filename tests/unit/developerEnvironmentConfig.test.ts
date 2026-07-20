import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Structural-shape assertions for the developer-environment configuration
 * surface mapped to VHS-REQ-688 (dev-only sweep, epic #2159). These configs
 * carry no runtime coverage, so their requirement guardrail is the structural
 * shape the build, debug, and mutation-analysis workflows depend on.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
}

describe('developerEnvironmentConfig structural shape (VHS-REQ-688)', () => {
  it('tsconfig.json compiles only src/**/*.ts into out under strict Node16 (VHS-REQ-688.1)', () => {
    const tsconfig = readJson('tsconfig.json') as {
      compilerOptions?: Record<string, unknown>;
      include?: string[];
    };
    const options = tsconfig.compilerOptions ?? {};

    expect(options.rootDir).toBe('src');
    expect(options.outDir).toBe('out');
    expect(options.strict).toBe(true);
    expect(options.module).toBe('Node16');
    expect(options.moduleResolution).toBe('node16');
    expect(tsconfig.include).toEqual(['src/**/*.ts']);
  });

  it('workspace launch/tasks/extensions stay structurally intact (VHS-REQ-688.2)', () => {
    const launch = readJson('.vscode/launch.json') as {
      configurations?: Array<{
        type?: string;
        args?: string[];
        preLaunchTask?: string;
      }>;
    };
    const configs = launch.configurations ?? [];
    expect(configs.length).toBeGreaterThanOrEqual(2);
    for (const config of configs) {
      expect(config.type).toBe('extensionHost');
      expect(
        (config.args ?? []).some((arg) => arg.includes('--extensionDevelopmentPath=')),
      ).toBe(true);
    }
    const integration = configs.find((config) =>
      (config.args ?? []).some((arg) => arg.includes('--extensionTestsPath=')),
    );
    expect(integration).toBeDefined();
    expect(integration?.preLaunchTask).toBe('npm: test:integration:compile');

    const tasks = readJson('.vscode/tasks.json') as {
      tasks?: Array<{ type?: string; script?: string }>;
    };
    const scripts = (tasks.tasks ?? []).map((task) => task.script);
    expect(scripts).toContain('compile');
    expect(scripts).toContain('test:integration:compile');

    const extensions = readJson('.vscode/extensions.json') as { recommendations?: string[] };
    expect(Array.isArray(extensions.recommendations)).toBe(true);
    expect(extensions.recommendations?.length).toBeGreaterThan(0);
  });

  it('stryker.config.mjs stays advisory and scoped to src/domain (VHS-REQ-688.3)', async () => {
    const configModule = (await import('../../stryker.config.mjs')) as {
      default: {
        mutate?: string[];
        thresholds?: { break?: number | null };
      };
    };
    const config = configModule.default;
    expect(config.mutate).toEqual(['src/domain/**/*.ts']);
    expect(config.thresholds?.break).toBeNull();
  });
});
