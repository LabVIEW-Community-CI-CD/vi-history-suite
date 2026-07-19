import { describe, expect, it, vi } from 'vitest';

import type { ViPreviewRuntimeSelection } from '../../src/reporting/viPreview/viPreviewExecution';
import type { RenderViPreviewForFileResult } from '../../src/reporting/viPreview/viPreviewFileRender';
import {
  countInlinePreviewImages,
  isViPreviewVerificationPassing,
  summarizeViPreviewRender,
  verifyViPreviewRender
} from '../../src/reporting/viPreview/viPreviewVerification';

const htmlWith = (images: number): string =>
  `<html><body>${'<img src="data:image/png;base64,AAAA"/>'.repeat(images)}</body></html>`;

describe('countInlinePreviewImages', () => {
  it('returns 0 for undefined or image-less HTML', () => {
    expect(countInlinePreviewImages(undefined)).toBe(0);
    expect(countInlinePreviewImages('<html></html>')).toBe(0);
  });

  it('counts inline base64 PNG data URIs', () => {
    expect(countInlinePreviewImages(htmlWith(3))).toBe(3);
  });
});

describe('summarizeViPreviewRender', () => {
  it('summarizes a rendered result', () => {
    const result: RenderViPreviewForFileResult = { outcome: 'rendered', html: htmlWith(10), cached: false };
    const proof = summarizeViPreviewRender('linux-container', '/repo/Sample.vi', result);
    expect(proof).toEqual({
      outcome: 'rendered',
      provider: 'linux-container',
      sampleViPath: '/repo/Sample.vi',
      htmlBytes: htmlWith(10).length,
      inlineImageCount: 10,
      cached: false,
      failureReason: undefined,
      stderr: undefined
    });
  });

  it('summarizes a failed result with no images', () => {
    const result: RenderViPreviewForFileResult = {
      outcome: 'failed',
      failureReason: 'command-exited-nonzero'
    };
    const proof = summarizeViPreviewRender('host-native', '/repo/Sample.vi', result);
    expect(proof.outcome).toBe('failed');
    expect(proof.inlineImageCount).toBe(0);
    expect(proof.htmlBytes).toBe(0);
    expect(proof.failureReason).toBe('command-exited-nonzero');
  });

  it('retains the tail of stderr (last 4000 chars) when present', () => {
    // A failing render can produce long LabVIEW/CLI stderr; the proof keeps only
    // the last 4000 chars so evidence stays bounded but the actionable tail (the
    // final error) is preserved.
    const longTail = 'END-OF-STDERR-MARKER';
    const stderr = 'x'.repeat(5000) + longTail;
    const proof = summarizeViPreviewRender('host-native', '/repo/Sample.vi', {
      outcome: 'failed',
      failureReason: 'command-exited-nonzero',
      stderr
    });
    expect(proof.stderr).toHaveLength(4000);
    expect(proof.stderr?.endsWith(longTail)).toBe(true);
    // The head beyond the 4000-char window is dropped.
    expect(proof.stderr?.startsWith('x')).toBe(true);
  });

  it('defaults cached to false when the render result omits it', () => {
    // result.cached is optional; an absent value must summarize as false (not
    // undefined and not true), so the `?? false` fallback is a real contract.
    const proof = summarizeViPreviewRender('linux-container', '/repo/Sample.vi', {
      outcome: 'rendered',
      html: htmlWith(2)
    });
    expect(proof.cached).toBe(false);
  });

  it('preserves a cached:true render result', () => {
    const proof = summarizeViPreviewRender('linux-container', '/repo/Sample.vi', {
      outcome: 'rendered',
      html: htmlWith(2),
      cached: true
    });
    expect(proof.cached).toBe(true);
  });
});

describe('isViPreviewVerificationPassing', () => {
  it('passes only for a rendered document with at least one image', () => {
    expect(
      isViPreviewVerificationPassing({
        outcome: 'rendered',
        provider: 'host-native',
        sampleViPath: 's',
        htmlBytes: 100,
        inlineImageCount: 1,
        cached: false
      })
    ).toBe(true);
    // Rendered but image-less does not prove the renderer worked.
    expect(
      isViPreviewVerificationPassing({
        outcome: 'rendered',
        provider: 'host-native',
        sampleViPath: 's',
        htmlBytes: 10,
        inlineImageCount: 0,
        cached: false
      })
    ).toBe(false);
    expect(
      isViPreviewVerificationPassing({
        outcome: 'blocked',
        provider: 'host-native',
        sampleViPath: 's',
        htmlBytes: 0,
        inlineImageCount: 0,
        cached: false
      })
    ).toBe(false);
  });
});

function makeDeps(html: string, outputExists = true) {
  return {
    createWorkspaceDirectory: vi.fn().mockResolvedValue('/tmp/ws'),
    listSourceFiles: vi.fn().mockResolvedValue([]),
    ensureDirectory: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(html),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    execution: {
      runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      pathExists: vi.fn().mockResolvedValue(outputExists)
    }
  };
}

describe('verifyViPreviewRender', () => {
  const hostRuntime: ViPreviewRuntimeSelection = {
    provider: 'host-native',
    labviewCliPath: '/usr/local/bin/LabVIEWCLI'
  };

  it('renders the sample VI and returns a passing proof', async () => {
    const proof = await verifyViPreviewRender(
      { runtime: hostRuntime, sampleViPath: '/repo/Sample.vi', operationDirectory: '/ops' },
      makeDeps(htmlWith(10))
    );
    expect(proof.outcome).toBe('rendered');
    expect(proof.inlineImageCount).toBe(10);
    expect(isViPreviewVerificationPassing(proof)).toBe(true);
  });

  it('returns a blocked proof (not throwing) when the runtime is incomplete', async () => {
    const proof = await verifyViPreviewRender(
      { runtime: { provider: 'host-native' }, sampleViPath: '/repo/Sample.vi', operationDirectory: '/ops' },
      makeDeps(htmlWith(0))
    );
    expect(proof.outcome).toBe('blocked');
    expect(isViPreviewVerificationPassing(proof)).toBe(false);
  });
});
