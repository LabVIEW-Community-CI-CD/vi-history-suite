import { describe, expect, it } from 'vitest';

import {
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
