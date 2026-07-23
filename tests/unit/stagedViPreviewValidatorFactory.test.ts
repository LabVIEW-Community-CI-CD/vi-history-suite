import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import {
  buildNodeViPreviewRenderDeps,
  buildStagedViPreviewValidator,
  classifyStagedPreviewRender
} from '../../src/reporting/viPreview/stagedViPreviewValidatorFactory';
import type { RenderViPreviewForFileResult } from '../../src/reporting/viPreview/viPreviewFileRender';
import type { StagedViPreviewValidatorInput } from '../../src/reporting/comparisonPreviewPipelineIntegration';
import type { ComparisonReportPacketRecord } from '../../src/reporting/comparisonReportPacket';

/**
 * VHS-REQ-699.7: the staged-VI preview validator factory (always-on live-
 * comparison wiring) maps a preview render outcome onto the pipeline's load-
 * validation gate and never blocks a comparison when the preview runtime is
 * merely unavailable.
 */
function buildInput(provider: string): StagedViPreviewValidatorInput {
  return {
    side: 'left',
    viFilePath: '/staged/left.vi',
    record: {
      runtimeSelection: { provider },
      stagedRevisionPlan: { treeRoot: '/staged/tree' }
    } as unknown as ComparisonReportPacketRecord
  };
}

describe('classifyStagedPreviewRender', () => {
  it('treats a rendered preview as a passed gate carrying the html', () => {
    const result: RenderViPreviewForFileResult = { outcome: 'rendered', html: '<html></html>' };
    expect(classifyStagedPreviewRender(result)).toEqual({ rendered: true, html: '<html></html>' });
  });

  it('treats a blocked preview (unavailable runtime) as a passed gate, not a failure', () => {
    const result: RenderViPreviewForFileResult = { outcome: 'blocked' };
    expect(classifyStagedPreviewRender(result)).toEqual({ rendered: true });
  });

  it('treats a failed preview as a failed gate carrying the reason', () => {
    const result: RenderViPreviewForFileResult = {
      outcome: 'failed',
      failureReason: 'labview-preview-operation-load-failed'
    };
    expect(classifyStagedPreviewRender(result)).toEqual({
      rendered: false,
      failureReason: 'labview-preview-operation-load-failed'
    });
  });

  it('defaults the failure reason to preview-render-failed when the render omits one', () => {
    // A failed render without an explicit reason must still yield a concrete,
    // stable failureReason for the gate rather than leaking undefined.
    const result: RenderViPreviewForFileResult = { outcome: 'failed' };
    expect(classifyStagedPreviewRender(result)).toEqual({
      rendered: false,
      failureReason: 'preview-render-failed'
    });
  });
});

describe('buildStagedViPreviewValidator', () => {
  it('renders via the injected override and classifies the result', async () => {
    let seenOperationDirectory: string | undefined;
    const validator = buildStagedViPreviewValidator({
      operationDirectory: '/ops',
      render: async (_input, operationDirectory) => {
        seenOperationDirectory = operationDirectory;
        return { outcome: 'rendered' };
      }
    });

    const result = await validator(buildInput('host-native'));

    expect(result).toEqual({ rendered: true });
    expect(seenOperationDirectory).toBe('/ops');
  });

  it('classifies an injected render failure as a failed gate', async () => {
    const validator = buildStagedViPreviewValidator({
      operationDirectory: '/ops',
      render: async () =>
        ({ outcome: 'failed', failureReason: 'preview-output-not-produced' })
    });

    const result = await validator(buildInput('host-native'));

    expect(result).toEqual({ rendered: false, failureReason: 'preview-output-not-produced' });
  });

  it('passes the gate without rendering when no preview runtime is available', async () => {
    // No render override: the factory maps the runtime, and an unmappable
    // provider resolves to blocked, so the gate passes without launching LabVIEW.
    const validator = buildStagedViPreviewValidator({ operationDirectory: '/ops' });

    const result = await validator(buildInput('unknown-provider'));

    expect(result).toEqual({ rendered: true });
  });
});

/**
 * VHS-REQ-699.4 / VHS-REQ-699.7: the node filesystem/process render dependencies
 * the always-on validator wires. Exercised against a real temp directory so the
 * fs closures (staging-base resolution, source enumeration, hashing, cleanup) are
 * covered without a LabVIEW runtime or Docker.
 */
describe('buildNodeViPreviewRenderDeps', () => {
  function inputWithTree(treeRoot: string | undefined): StagedViPreviewValidatorInput {
    return {
      side: 'left',
      viFilePath: path.join(treeRoot ?? '/staged', 'left.vi'),
      record: {
        runtimeSelection: { provider: 'linux-container' },
        stagedRevisionPlan: { treeRoot }
      } as unknown as ComparisonReportPacketRecord
    };
  }

  it('resolves the staging base to the materialized tree root when known', async () => {
    const deps = buildNodeViPreviewRenderDeps(inputWithTree('/staged/tree'));
    expect(deps.resolveStagingBaseDirectory).toBeDefined();
    await expect(deps.resolveStagingBaseDirectory!('/anything')).resolves.toBe('/staged/tree');
  });

  it('omits the staging-base resolver when no tree root is known', () => {
    const deps = buildNodeViPreviewRenderDeps(inputWithTree(undefined));
    expect(deps.resolveStagingBaseDirectory).toBeUndefined();
  });

  it('enumerates only LabVIEW source files with sizes, and cleans up', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-factory-fs-'));
    try {
      await fs.writeFile(path.join(dir, 'a.vi'), 'AAAA');
      await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(dir, 'sub', 'b.ctl'), 'BB');
      await fs.writeFile(path.join(dir, 'notes.txt'), 'ignore me');

      const deps = buildNodeViPreviewRenderDeps(inputWithTree(dir));
      const entries = await deps.listSourceFiles(dir);
      const rel = entries.map((e) => e.relativePath.replace(/\\/g, '/')).sort();
      expect(rel).toEqual(['a.vi', 'sub/b.ctl']);
      expect(entries.every((e) => typeof e.sizeBytes === 'number' && e.sizeBytes > 0)).toBe(true);

      // ensureDirectory + copyFile + hashFile + readFile round-trip.
      const nested = path.join(dir, 'ws', 'vi');
      await deps.ensureDirectory(nested);
      const dest = path.join(nested, 'a.vi');
      await deps.copyFile(path.join(dir, 'a.vi'), dest);
      expect(await deps.readFile(dest)).toBe('AAAA');
      const expected = createHash('sha256').update(Buffer.from('AAAA')).digest('hex');
      await expect(deps.hashFile!(dest)).resolves.toBe(expected);

      // removeDirectory is recursive+force (idempotent on a missing dir).
      await deps.removeDirectory(path.join(dir, 'ws'));
      await expect(fs.access(path.join(dir, 'ws'))).rejects.toBeTruthy();
      await deps.removeDirectory(path.join(dir, 'does-not-exist'));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty source list when the directory cannot be read', async () => {
    const deps = buildNodeViPreviewRenderDeps(inputWithTree('/staged/tree'));
    await expect(deps.listSourceFiles('/no/such/dir/here')).resolves.toEqual([]);
  });

  it('pathExists reports true for an existing file and false otherwise', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vihs-factory-exists-'));
    try {
      const file = path.join(dir, 'present.vi');
      await fs.writeFile(file, 'x');
      const deps = buildNodeViPreviewRenderDeps(inputWithTree(dir));
      await expect(deps.execution!.pathExists(file)).resolves.toBe(true);
      await expect(deps.execution!.pathExists(path.join(dir, 'absent.vi'))).resolves.toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('creates a fresh workspace directory under the OS temp root', async () => {
    const deps = buildNodeViPreviewRenderDeps(inputWithTree('/staged/tree'));
    const ws = await deps.createWorkspaceDirectory();
    try {
      const stat = await fs.stat(ws);
      expect(stat.isDirectory()).toBe(true);
      expect(path.basename(ws).startsWith('vihs-staged-vi-preview-')).toBe(true);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });
});
