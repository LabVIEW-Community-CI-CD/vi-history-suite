// Requirement coverage: VHS-REQ-662 (VI semantic comparison model and agent MCP
// surface). Verifies the dependency-free JSON-RPC handler (VHS-REQ-662.3) and
// the exposed agent tool set (VHS-REQ-662.4).
import { describe, expect, it, vi } from 'vitest';

import {
  handleViSemanticMcpMessage,
  handleViSemanticMcpMessageAsync,
  JsonRpcSuccess,
  VI_SEMANTIC_MCP_PROTOCOL_VERSION,
  VI_SEMANTIC_MCP_SERVER_INFO,
  VI_SEMANTIC_MCP_TOOLS,
  VI_SEMANTIC_MCP_ASYNC_ONLY_TOOL_NAMES,
  VI_SEMANTIC_MCP_SYNC_CAPABLE_TOOL_NAMES,
  VI_SEMANTIC_MCP_PROMPTS,
  VI_SEMANTIC_MCP_RESOURCES,
  VI_SEMANTIC_MCP_RESOURCE_TEMPLATES
} from '../../src/semantic/viSemanticComparisonMcp';
import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';
import type { ViSemanticHistory } from '../../src/semantic/viSemanticHistory';
import type { ViRepositoryIndex } from '../../src/semantic/viRepositoryIndex';
import type { ViSemanticPrReview } from '../../src/semantic/viSemanticPrReview';
import {
  buildViSemanticComparisonModelFromHtml,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from '../../src/semantic/viSemanticModel';
import { buildLvkitViScanEnvelope } from '../../src/semantic/lvkit/lvkitViScanModel';

const REPORT_HTML = `<!DOCTYPE html>
<html><body>
  <h1 class="report-title">LabVIEW VI Comparison Report</h1>
  <table class="difference">
    <tr class="compared-vi-image-captions"><td class="compared-vi-image-caption">Block Diagram Overview</td></tr>
    <tr class="compared-images"><td><img class="difference-image" src="assets/block.png"/></td></tr>
  </table>
  <ul class="inclusion-list"><li class="checked">Front Panel</li></ul>
  <h2 class="section-header">Detailed Information</h2>
  <details><summary class="difference-heading">Block Diagram</summary>
    <ol><li class="diff-detail">Wire changed</li></ol>
  </details>
</body></html>`;

function successResult(response: ReturnType<typeof handleViSemanticMcpMessage>): unknown {
  expect(response).not.toBeNull();
  expect(response).toHaveProperty('result');
  return (response as JsonRpcSuccess).result;
}

/**
 * Asserts the response is a structured JSON-RPC -32602 (Invalid params) error and
 * returns its `error` object (with field-level `data.issues`) for further checks.
 */
function invalidParamsError(
  response: ReturnType<typeof handleViSemanticMcpMessage>
): { code: number; message: string; data?: { issues?: Array<{ field: string; expected: string; received: string }> } } {
  expect(response).not.toBeNull();
  expect(response).toHaveProperty('error');
  const error = (response as { error: { code: number; message: string; data?: { issues?: Array<{ field: string; expected: string; received: string }> } } }).error;
  expect(error.code).toBe(-32602);
  return error;
}

describe('viSemanticComparisonMcp', () => {
  it('answers the initialize handshake with protocol and server info', () => {
    const result = successResult(
      handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    ) as Record<string, unknown>;
    expect(result.protocolVersion).toBe(VI_SEMANTIC_MCP_PROTOCOL_VERSION);
    expect(result.serverInfo).toEqual(VI_SEMANTIC_MCP_SERVER_INFO);
    expect(result.capabilities).toMatchObject({ tools: {}, prompts: {}, resources: {}, completions: {} });
  });

  it('returns no response for notifications', () => {
    expect(
      handleViSemanticMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })
    ).toBeNull();
  });

  it('answers ping with an empty result', () => {
    expect(successResult(handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 2, method: 'ping' }))).toEqual(
      {}
    );
  });

  it('lists the semantic comparison tools', () => {
    const result = successResult(
      handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
    ) as { tools: Array<{ name: string }> };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'summarize_vi_comparison',
      'get_vi_semantic_comparison',
      'get_vi_preview_comparison_correlation',
      'get_vi_preview_region_correlation',
      'compare_vi_revisions',
      'summarize_vi_history',
      'index_repository_vis',
      'build_vi_pr_review',
      'get_vi_semantic_schema',
      'validate_vi_semantic_document',
      'list_preview_cache',
      'summarize_preview_cache',
      'diagnose_preview_cache',
      'search_preview_cache',
      'get_preview_cache_entry',
      'get_runtime_health',
      'get_preview_diagnostics',
      'list_changed_vis',
      'get_vi_generated_code'
    ]);
    expect(result.tools).toEqual(VI_SEMANTIC_MCP_TOOLS);
  });

  it('partitions every registered tool into exactly one of async-only or sync-capable', () => {
    const registryNames = VI_SEMANTIC_MCP_TOOLS.map((tool) => tool.name).sort();
    const asyncOnly = new Set(VI_SEMANTIC_MCP_ASYNC_ONLY_TOOL_NAMES);
    const syncCapable = new Set(VI_SEMANTIC_MCP_SYNC_CAPABLE_TOOL_NAMES);

    // The union covers the whole registry (no tool silently falls through to
    // "unknown tool" in the dispatcher) ...
    expect([...asyncOnly, ...syncCapable].sort()).toEqual(registryNames);
    // ... and the two partitions are disjoint (no tool is both).
    for (const name of asyncOnly) {
      expect(syncCapable.has(name)).toBe(false);
    }
    // Every async-only name is a real registered tool.
    for (const name of asyncOnly) {
      expect(registryNames).toContain(name);
    }
  });

  it('annotates every tool as read-only with an open-world hint matching the async-only partition', () => {
    const asyncOnly = new Set(VI_SEMANTIC_MCP_ASYNC_ONLY_TOOL_NAMES);
    for (const tool of VI_SEMANTIC_MCP_TOOLS) {
      const annotations = (tool as { annotations?: Record<string, unknown> }).annotations;
      expect(annotations, `${tool.name} must declare annotations`).toBeDefined();
      // Every vi-history-suite tool is non-mutating.
      expect(annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(typeof annotations?.title).toBe('string');
      // openWorldHint is true exactly for the tools that reach an external
      // system (Git / comparison runtime / preview-cache fs) — i.e. the
      // async-only partition — and false for the pure, in-process tools.
      expect(annotations?.openWorldHint).toBe(asyncOnly.has(tool.name));
    }
  });

  it('summarizes a comparison into a narrative through tools/call', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'summarize_vi_comparison', arguments: { reportHtml: REPORT_HTML } }
      })
    ) as { content: Array<{ type: string; text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('The block diagram differs.');
  });

  it('returns the full semantic model as JSON through tools/call', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'get_vi_semantic_comparison',
          arguments: {
            reportHtml: REPORT_HTML,
            revisions: { baseHash: 'a1', selectedHash: 'b2' }
          }
        }
      })
    ) as { content: Array<{ text: string }> };
    const model = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(model.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    expect(model.revisions).toEqual({ baseHash: 'a1', selectedHash: 'b2' });
    expect(model.changedSurfaces).toContain('block-diagram');
  });

  it('returns a markdown review block for get_vi_semantic_comparison when requested', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'get_vi_semantic_comparison',
          arguments: { reportHtml: REPORT_HTML, format: 'markdown' }
        }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('### VI comparison:');
    expect(result.content[0].text).toContain('The block diagram differs.');
  });

  it('returns the preview-comparison correlation model as JSON with caller-supplied previews (VHS-REQ-703.12)', () => {
    const reportHtml = `<h1 class="report-title">R</h1>
      <h2 class="section-header">Detailed Information</h2>
      <details><summary class="difference-heading">3. Block Diagram objects</summary>
        <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`;
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: {
            reportHtml,
            previews: {
              base: { available: true, revision: 'aaaa', inlineImageCount: 3 },
              head: { available: true, revision: 'bbbb' }
            }
          }
        }
      })
    ) as { content: Array<{ text: string }> };
    const correlation = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(correlation.schema).toBe('vi-history-suite/vi-preview-comparison-correlation@v1');
    const surfaces = correlation.surfaces as Array<Record<string, unknown>>;
    const bd = surfaces.find((s) => s.surface === 'block-diagram');
    expect(bd?.correlated).toBe(true);
    expect(bd?.coordinateChanges).toEqual([
      {
        text: 'SubVI "X.vi" - added at (1570,358)',
        changeType: 'added',
        objectKind: 'SubVI',
        objectName: 'X.vi',
        coordinate: { x: 1570, y: 358 }
      }
    ]);
    expect((correlation.previews as { base: { inlineImageCount: number } }).base.inlineImageCount).toBe(3);
  });

  it('renders the correlation as markdown (narrative + surface table) and defaults previews to unavailable', () => {
    const reportHtml = `<h1 class="report-title">R</h1>
      <h2 class="section-header">Detailed Information</h2>
      <details><summary class="difference-heading">3. Block Diagram objects</summary>
        <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`;
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: { reportHtml, format: 'markdown' }
        }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    // No previews supplied -> both sides unavailable, table still renders the row.
    expect(result.content[0].text).toContain('| Surface | Change kinds | Changes | Base preview | Head preview | Diagram coordinates |');
    expect(result.content[0].text).toContain('X.vi (1570,358)');
    expect(result.content[0].text).toContain('— unavailable');
  });

  it('rejects a correlation call with an empty reportHtml as -32602', () => {
    const error = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 23,
        method: 'tools/call',
        params: { name: 'get_vi_preview_comparison_correlation', arguments: { reportHtml: '' } }
      })
    );
    expect(error.message).toContain('reportHtml');
  });

  it('returns the preview-region correlation as JSON (diagram-space-only, VHS-REQ-703.15)', () => {
    const reportHtml = `<h1 class="report-title">R</h1>
      <h2 class="section-header">Detailed Information</h2>
      <details><summary class="difference-heading">3. Block Diagram objects</summary>
        <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`;
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 41,
        method: 'tools/call',
        params: { name: 'get_vi_preview_region_correlation', arguments: { reportHtml } }
      })
    ) as { content: Array<{ text: string }> };
    const region = JSON.parse(result.content[0].text) as {
      schema: string;
      entries: Array<{ id: string; coordinate: { x: number; y: number }; located: boolean }>;
      totals: { regionCount: number; locatedRegionCount: number };
    };
    expect(region.schema).toBe('vi-history-suite/vi-preview-region-correlation@v2');
    expect(region.entries[0]).toMatchObject({ id: 'X.vi', coordinate: { x: 1570, y: 358 }, located: false });
    expect(region.totals).toMatchObject({ regionCount: 1, locatedRegionCount: 0 });
  });

  it('renders the preview-region correlation as markdown when requested (VHS-REQ-703.15)', () => {
    const reportHtml = `<h1 class="report-title">R</h1>
      <h2 class="section-header">Detailed Information</h2>
      <details><summary class="difference-heading">3. Block Diagram objects</summary>
        <ol><li class="diff-detail">SubVI "X.vi" - added at (1570,358)</li></ol></details>`;
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 42,
        method: 'tools/call',
        params: { name: 'get_vi_preview_region_correlation', arguments: { reportHtml, format: 'markdown' } }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('| Object | Change | Diagram (x,y) | Base region (px) | Head region (px) |');
    expect(result.content[0].text).toContain('| X.vi | added | (1570,358) | — | — |');
  });

  it('rejects a supplied preview side without a boolean available as -32602 naming the nested field', () => {
    const error = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 24,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: {
            reportHtml: '<h1 class="report-title">R</h1>',
            previews: { base: { revision: 'aaaa' } }
          }
        }
      })
    );
    expect(error.message).toContain('previews.base.available');
    expect(error.data?.issues?.[0]).toMatchObject({
      field: 'previews.base.available',
      expected: 'a boolean'
    });
  });

  it('rejects an array preview side with a structured -32602 (VHS-REQ-703.12)', () => {
    // An array is typeof 'object' but is not a valid preview reference.
    const arrayError = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 25,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: { reportHtml: '<h1 class="report-title">R</h1>', previews: { head: [] } }
        }
      })
    );
    expect(arrayError.message).toContain('previews.head');
  });

  it('rejects an array previews value with a structured -32602 (VHS-REQ-703.12)', () => {
    const arrayError = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 27,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: { reportHtml: '<h1 class="report-title">R</h1>', previews: [] }
        }
      })
    );
    expect(arrayError.message).toContain('previews');
  });

  it('drops a negative inlineImageCount rather than trusting it (VHS-REQ-703.12)', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 26,
        method: 'tools/call',
        params: {
          name: 'get_vi_preview_comparison_correlation',
          arguments: {
            reportHtml: '<h1 class="report-title">R</h1>',
            previews: { base: { available: true, inlineImageCount: -3 } }
          }
        }
      })
    ) as { content: Array<{ text: string }> };
    const correlation = JSON.parse(result.content[0].text) as {
      previews: { base: Record<string, unknown> };
    };
    expect(correlation.previews.base.available).toBe(true);
    expect(correlation.previews.base.inlineImageCount).toBeUndefined();
  });

  it('rejects invalid arguments with a structured -32602 naming the field', () => {
    const error = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'summarize_vi_comparison', arguments: { reportHtml: '' } }
      })
    );
    expect(error.message).toContain('reportHtml');
    expect(error.data?.issues?.[0]).toMatchObject({
      field: 'reportHtml',
      expected: 'a non-empty string',
      received: 'empty string'
    });
  });

  it('rejects an unknown tool and a missing tool name as invalid params', () => {
    const unknownTool = handleViSemanticMcpMessage({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'does_not_exist', arguments: {} }
    });
    expect(unknownTool).toMatchObject({ error: { code: -32602 } });

    const missingName = handleViSemanticMcpMessage({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {}
    });
    expect(missingName).toMatchObject({ error: { code: -32602 } });
  });

  it('rejects an unknown method with method-not-found', () => {
    expect(
      handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 9, method: 'resources/subscribe' })
    ).toMatchObject({ error: { code: -32601, message: 'unknown method: resources/subscribe' } });
  });

  it('returns all published schemas for get_vi_semantic_schema', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 60,
        method: 'tools/call',
        params: { name: 'get_vi_semantic_schema', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    const schemas = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(Object.keys(schemas)).toContain('vi-history-suite/vi-semantic-comparison@v1');
    expect(Object.keys(schemas)).toContain('vi-history-suite/vi-repository-index@v1');
  });

  it('returns a single schema by id and errors on an unknown id', () => {
    const one = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 61,
        method: 'tools/call',
        params: {
          name: 'get_vi_semantic_schema',
          arguments: { schema: 'vi-history-suite/vi-semantic-history@v1' }
        }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(one.isError).toBe(false);
    const schema = JSON.parse(one.content[0].text) as { $id: string };
    expect(schema.$id).toBe('vi-history-suite/vi-semantic-history@v1');

    const unknown = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 62,
        method: 'tools/call',
        params: { name: 'get_vi_semantic_schema', arguments: { schema: 'nope@v9' } }
      })
    );
    expect(unknown.data?.issues?.[0]).toMatchObject({ field: 'schema' });
  });

  it('validates a document through validate_vi_semantic_document', () => {
    const valid = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 63,
        method: 'tools/call',
        params: {
          name: 'validate_vi_semantic_document',
          arguments: {
            document: {
              schema: 'vi-history-suite/vi-repository-index@v1',
              repositoryRoot: '/r',
              viCount: 0,
              indexedCount: 0,
              vis: [],
              narrative: 'x'
            }
          }
        }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(valid.isError).toBe(false);
    expect(JSON.parse(valid.content[0].text)).toEqual({ valid: true, errors: [] });

    const invalid = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 64,
        method: 'tools/call',
        params: {
          name: 'validate_vi_semantic_document',
          arguments: { document: { schema: 'vi-history-suite/vi-repository-index@v1' } }
        }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(invalid.isError).toBe(false);
    const report = JSON.parse(invalid.content[0].text) as { valid: boolean; errors: string[] };
    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it('rejects validate_vi_semantic_document without a document as -32602', () => {
    const error = invalidParamsError(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 65,
        method: 'tools/call',
        params: { name: 'validate_vi_semantic_document', arguments: {} }
      })
    );
    expect(error.data?.issues?.[0]).toMatchObject({ field: 'document' });
  });

  it('directs a synchronous compare_vi_revisions call to the async entrypoint', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: { name: 'compare_vi_revisions', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires the async MCP server');
  });

  it('directs a synchronous summarize_vi_history call to the async entrypoint', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: { name: 'summarize_vi_history', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires the async MCP server');
  });

  it('directs a synchronous index_repository_vis call to the async entrypoint', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 32,
        method: 'tools/call',
        params: { name: 'index_repository_vis', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires the async MCP server');
  });

  it('directs a synchronous build_vi_pr_review call to the async entrypoint', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 33,
        method: 'tools/call',
        params: { name: 'build_vi_pr_review', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('requires the async MCP server');
  });

  describe('handleViSemanticMcpMessageAsync', () => {
    const validArgs = {
      repositoryRoot: '/repo',
      relativePath: 'vis/Widget.vi',
      baseHash: 'aaaa',
      selectedHash: 'bbbb'
    };
    const compareCall = (args: unknown, id = 20) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name: 'compare_vi_revisions', arguments: args }
    });

    it('delegates non-compare methods to the synchronous handler', async () => {
      const response = await handleViSemanticMcpMessageAsync({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      });
      expect(response).toEqual(
        handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      );
    });

    it('returns the semantic model JSON for a completed comparison', async () => {
      const model = buildViSemanticComparisonModelFromHtml(REPORT_HTML);
      const compareViRevisions = vi.fn(
        async (): Promise<CompareViRevisionsResult> => ({
          status: 'completed',
          hasDifferences: true,
          model,
          runtime: {
            provider: 'linux-container',
            engine: 'labview-cli',
            state: 'succeeded',
            reportFilePath: '/t/report.html'
          }
        })
      );
      const response = successResult(
        await handleViSemanticMcpMessageAsync(compareCall(validArgs), { compareViRevisions })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(compareViRevisions).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryRoot: '/repo', baseHash: 'aaaa', selectedHash: 'bbbb' })
      );
      const parsed = JSON.parse(response.content[0].text) as { schema: string };
      expect(parsed.schema).toBe(VI_SEMANTIC_COMPARISON_SCHEMA);
    });

    it('threads optional reportType and runtime through to the compare orchestrator', async () => {
      const model = buildViSemanticComparisonModelFromHtml(REPORT_HTML);
      const compareViRevisions = vi.fn(
        async (): Promise<CompareViRevisionsResult> => ({
          status: 'completed',
          hasDifferences: true,
          model
        })
      );
      await handleViSemanticMcpMessageAsync(
        compareCall({
          ...validArgs,
          reportType: 'print',
          runtime: { provider: 'linux-container' }
        }),
        { compareViRevisions }
      );
      expect(compareViRevisions).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'print',
          runtime: { provider: 'linux-container' }
        })
      );
    });

    it('rejects an invalid reportType as -32602 naming the field (#2105)', async () => {
      const compareViRevisions = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        compareCall({ ...validArgs, reportType: 'gui' }),
        { compareViRevisions }
      );
      expect(response).toMatchObject({ error: { code: -32602 } });
      const error = (response as { error: { data?: { issues?: Array<{ field: string }> } } }).error;
      expect(error.data?.issues?.[0]?.field).toBe('reportType');
      // A bad optional enum is caught before the comparison runs.
      expect(compareViRevisions).not.toHaveBeenCalled();
    });

    it('surfaces a blocked comparison through the error envelope', async () => {
      const compareViRevisions = vi.fn(
        async (): Promise<CompareViRevisionsResult> => ({
          status: 'blocked-selection',
          reason: 'docker-daemon-unreachable'
        })
      );
      const response = successResult(
        await handleViSemanticMcpMessageAsync(compareCall(validArgs), { compareViRevisions })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('blocked-selection');
      expect(response.content[0].text).toContain('docker-daemon-unreachable');
    });

    it('reports a wired-up error when no orchestrator is injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(compareCall(validArgs))
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('rejects invalid compare arguments before invoking the orchestrator', async () => {
      const compareViRevisions = vi.fn(
        async (): Promise<CompareViRevisionsResult> => ({ status: 'failed', reason: 'unused' })
      );
      const response = await handleViSemanticMcpMessageAsync(compareCall({ repositoryRoot: '/repo' }), {
        compareViRevisions
      });
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'relativePath' });
      expect(compareViRevisions).not.toHaveBeenCalled();
    });

    const historyCall = (args: unknown, id = 40) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name: 'summarize_vi_history', arguments: args }
    });

    it('returns the history model JSON for a completed walk', async () => {
      const history = {
        schema: 'vi-history-suite/vi-semantic-history@v1',
        vi: { relativePath: 'vis/Widget.vi' },
        repositoryRoot: '/repo',
        revisionCount: 2,
        comparedStepCount: 1,
        steps: [],
        totals: {
          changingStepCount: 1,
          frontPanelChangeCount: 1,
          blockDiagramChangeCount: 0,
          connectorPaneChangeCount: 0,
          viAttributeChangeCount: 0,
          blockedOrFailedStepCount: 0
        },
        narrative: 'Across 1 compared revision of vis/Widget.vi, 1 changed the VI.'
      } as ViSemanticHistory;
      const buildViSemanticHistory = vi.fn(async (): Promise<ViSemanticHistory> => history);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          historyCall({ repositoryRoot: '/repo', relativePath: 'vis/Widget.vi', maxRevisions: 2 }),
          { buildViSemanticHistory }
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(buildViSemanticHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryRoot: '/repo',
          relativePath: 'vis/Widget.vi',
          maxRevisions: 2
        })
      );
      const parsed = JSON.parse(response.content[0].text) as { schema: string };
      expect(parsed.schema).toBe('vi-history-suite/vi-semantic-history@v1');
    });

    it('threads the optional runtime through to the history orchestrator', async () => {
      const buildViSemanticHistory = vi.fn(
        async (): Promise<ViSemanticHistory> => ({}) as ViSemanticHistory
      );
      await handleViSemanticMcpMessageAsync(
        historyCall({
          repositoryRoot: '/repo',
          relativePath: 'vis/Widget.vi',
          runtime: { provider: 'linux-container' }
        }),
        { buildViSemanticHistory }
      );
      expect(buildViSemanticHistory).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: { provider: 'linux-container' } })
      );
    });

    it('reports a wired-up error when the history orchestrator is not injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          historyCall({ repositoryRoot: '/repo', relativePath: 'vis/Widget.vi' })
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('rejects invalid history arguments before invoking the orchestrator', async () => {
      const buildViSemanticHistory = vi.fn(
        async (): Promise<ViSemanticHistory> => ({}) as ViSemanticHistory
      );
      const response = await handleViSemanticMcpMessageAsync(historyCall({ repositoryRoot: '/repo' }), {
        buildViSemanticHistory
      });
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'relativePath' });
      expect(buildViSemanticHistory).not.toHaveBeenCalled();
    });

    it('renders a markdown review block for a completed comparison', async () => {
      const model = buildViSemanticComparisonModelFromHtml(REPORT_HTML);
      const compareViRevisions = vi.fn(
        async (): Promise<CompareViRevisionsResult> => ({
          status: 'completed',
          hasDifferences: true,
          model,
          runtime: {
            provider: 'linux-container',
            engine: 'labview-cli',
            state: 'succeeded',
            reportFilePath: '/t/report.html'
          }
        })
      );
      const response = successResult(
        await handleViSemanticMcpMessageAsync(compareCall({ ...validArgs, format: 'markdown' }), {
          compareViRevisions
        })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('### VI comparison:');
    });

    it('renders a markdown timeline for summarize_vi_history', async () => {
      const built = {
        schema: 'vi-history-suite/vi-semantic-history@v1',
        vi: { relativePath: 'vis/Widget.vi', title: 'Widget.vi' },
        repositoryRoot: '/repo',
        revisionCount: 2,
        comparedStepCount: 1,
        steps: [
          {
            baseHash: 'aaaa',
            selectedHash: 'bbbb1111',
            authorDate: '',
            authorName: 'Dev',
            subject: 'edit',
            status: 'completed',
            hasDifferences: true,
            changedSurfaces: ['front-panel'],
            narrative: 'The front panel differs.'
          }
        ],
        totals: {
          changingStepCount: 1,
          frontPanelChangeCount: 1,
          blockDiagramChangeCount: 0,
          connectorPaneChangeCount: 0,
          viAttributeChangeCount: 0,
          blockedOrFailedStepCount: 0
        },
        narrative: 'Across 1 compared revision of vis/Widget.vi, 1 changed the VI.'
      } as ViSemanticHistory;
      const buildViSemanticHistory = vi.fn(async (): Promise<ViSemanticHistory> => built);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          historyCall({
            repositoryRoot: '/repo',
            relativePath: 'vis/Widget.vi',
            format: 'markdown'
          }),
          { buildViSemanticHistory }
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('### VI history: Widget.vi');
      expect(response.content[0].text).toContain('| Revision | Changed | Surfaces |');
    });

    const indexCall = (args: unknown, id = 50) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name: 'index_repository_vis', arguments: args }
    });

    it('returns the repository index JSON for index_repository_vis', async () => {
      const index = {
        schema: 'vi-history-suite/vi-repository-index@v1',
        repositoryRoot: '/repo',
        viCount: 1,
        indexedCount: 1,
        vis: [{ relativePath: 'vis/A.vi', revisionCount: 3 }],
        narrative: 'Repository tracks 1 VI.'
      } as ViRepositoryIndex;
      const buildViRepositoryIndex = vi.fn(async (): Promise<ViRepositoryIndex> => index);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(indexCall({ repositoryRoot: '/repo', maxVis: 10 }), {
          buildViRepositoryIndex
        })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(buildViRepositoryIndex).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryRoot: '/repo', maxVis: 10 })
      );
      const parsed = JSON.parse(response.content[0].text) as { schema: string };
      expect(parsed.schema).toBe('vi-history-suite/vi-repository-index@v1');
    });

    it('reports a wired-up error when the index orchestrator is not injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(indexCall({ repositoryRoot: '/repo' }))
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('rejects invalid index arguments before invoking the orchestrator', async () => {
      const buildViRepositoryIndex = vi.fn(
        async (): Promise<ViRepositoryIndex> => ({}) as ViRepositoryIndex
      );
      const response = await handleViSemanticMcpMessageAsync(indexCall({}), { buildViRepositoryIndex });
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'repositoryRoot' });
      expect(buildViRepositoryIndex).not.toHaveBeenCalled();
    });

    const prReview = {
      schema: 'vi-history-suite/vi-semantic-pr-review@v1',
      repositoryRoot: '/repo',
      baseHash: 'aaaa',
      selectedHash: 'bbbb',
      changedViCount: 0,
      reviewedCount: 0,
      entries: [],
      totals: { withDifferences: 0, withoutDifferences: 0, blockedOrFailed: 0 },
      narrative: 'No changed VIs were found between the two revisions.'
    } as ViSemanticPrReview;

    const prReviewCall = (args: unknown, id = 60) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name: 'build_vi_pr_review', arguments: args }
    });

    it('returns the PR-review JSON for build_vi_pr_review', async () => {
      const buildViSemanticPrReview = vi.fn(async (): Promise<ViSemanticPrReview> => prReview);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          prReviewCall({
            repositoryRoot: '/repo',
            baseHash: 'aaaa',
            selectedHash: 'bbbb',
            maxVis: 10
          }),
          { buildViSemanticPrReview }
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(buildViSemanticPrReview).toHaveBeenCalledWith(
        expect.objectContaining({
          repositoryRoot: '/repo',
          baseHash: 'aaaa',
          selectedHash: 'bbbb',
          maxVis: 10
        })
      );
      const parsed = JSON.parse(response.content[0].text) as { schema: string };
      expect(parsed.schema).toBe('vi-history-suite/vi-semantic-pr-review@v1');
    });

    it('returns a sticky-ready markdown body for build_vi_pr_review when requested', async () => {
      const buildViSemanticPrReview = vi.fn(async (): Promise<ViSemanticPrReview> => prReview);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          prReviewCall({
            repositoryRoot: '/repo',
            baseHash: 'aaaa',
            selectedHash: 'bbbb',
            format: 'markdown'
          }),
          { buildViSemanticPrReview }
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(response.content[0].text).toContain('<!-- vi-history-suite:vi-semantic-pr-review -->');
      expect(response.content[0].text).toContain('## VI semantic review');
    });

    it('threads the optional runtime through to the PR-review orchestrator', async () => {
      const buildViSemanticPrReview = vi.fn(async (): Promise<ViSemanticPrReview> => prReview);
      await handleViSemanticMcpMessageAsync(
        prReviewCall({
          repositoryRoot: '/repo',
          baseHash: 'aaaa',
          selectedHash: 'bbbb',
          runtime: { provider: 'linux-container' }
        }),
        { buildViSemanticPrReview }
      );
      expect(buildViSemanticPrReview).toHaveBeenCalledWith(
        expect.objectContaining({ runtime: { provider: 'linux-container' } })
      );
    });

    it('reports a wired-up error when the PR-review orchestrator is not injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          prReviewCall({ repositoryRoot: '/repo', baseHash: 'a', selectedHash: 'b' })
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('rejects invalid PR-review arguments before invoking the orchestrator', async () => {
      const buildViSemanticPrReview = vi.fn(async (): Promise<ViSemanticPrReview> => prReview);
      const response = await handleViSemanticMcpMessageAsync(prReviewCall({ repositoryRoot: '/repo' }), {
        buildViSemanticPrReview
      });
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'baseHash' });
      expect(buildViSemanticPrReview).not.toHaveBeenCalled();
    });

    const cacheCall = (name: string, args: unknown, id = 80) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name, arguments: args }
    });
    const sampleEntry = {
      key: 'a'.repeat(64),
      filePath: '/cache/' + 'a'.repeat(64) + '.html',
      bytes: 1024,
      inlineImageCount: 3,
      interactive: true,
      flags: [] as never[],
      healthy: true
    };
    const inspector = () => ({
      list: vi.fn(async () => [sampleEntry]),
      summarize: vi.fn(async () => ({
        directory: '/cache',
        entryCount: 2,
        totalBytes: 2048,
        healthyCount: 1,
        flaggedCount: 1,
        interactiveCount: 1,
        flagged: [{ key: 'b'.repeat(64), flags: ['error-marker' as const] }],
        newestModifiedAt: '2026-07-19T12:00:00.000Z'
      })),
      search: vi.fn(async () => [sampleEntry]),
      get: vi.fn(async () => ({ ...sampleEntry, html: '<html></html>' }))
    });

    it('lists preview-cache entries through the injected inspector', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('list_preview_cache', { cacheDirectory: '/cache' }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(deps.previewCacheInspector.list).toHaveBeenCalledWith('/cache');
      const parsed = JSON.parse(response.content[0].text) as { entries: unknown[] };
      expect(parsed.entries).toHaveLength(1);
    });

    it('summarizes a preview cache', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('summarize_preview_cache', { cacheDirectory: '/cache' }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      const parsed = JSON.parse(response.content[0].text) as { flaggedCount: number };
      expect(parsed.flaggedCount).toBe(1);
    });

    it('diagnoses a preview cache into the diagnostics schema', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('diagnose_preview_cache', { cacheDirectory: '/cache' }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      const parsed = JSON.parse(response.content[0].text) as {
        schema: string;
        healthy: boolean;
        newestModifiedAt: string | null;
      };
      expect(parsed.schema).toBe('vi-history-suite/preview-cache-diagnostics@v1');
      expect(parsed.healthy).toBe(false);
      // #2107: the diagnostics payload now delivers the freshness signal the
      // tool description promises.
      expect(parsed.newestModifiedAt).toBe('2026-07-19T12:00:00.000Z');
    });

    it('searches a preview cache by marker', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('search_preview_cache', { cacheDirectory: '/cache', marker: 'interactive' }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(deps.previewCacheInspector.search).toHaveBeenCalledWith('/cache', 'interactive');
    });

    it('rejects an unknown search marker as -32602', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = await handleViSemanticMcpMessageAsync(
        cacheCall('search_preview_cache', { cacheDirectory: '/cache', marker: 'nope' }),
        deps
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'marker' });
    });

    it('fetches one preview-cache entry with includeHtml', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('get_preview_cache_entry', {
            cacheDirectory: '/cache',
            key: 'a'.repeat(64),
            includeHtml: true
          }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(false);
      expect(deps.previewCacheInspector.get).toHaveBeenCalledWith('/cache', 'a'.repeat(64), {
        includeHtml: true
      });
      const parsed = JSON.parse(response.content[0].text) as { html: string };
      expect(parsed.html).toBe('<html></html>');
    });

    it('reports an error when the requested cache entry is absent', async () => {
      const deps = {
        previewCacheInspector: { ...inspector(), get: vi.fn(async () => undefined) }
      };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('get_preview_cache_entry', { cacheDirectory: '/cache', key: 'a'.repeat(64) }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('no cache entry');
    });

    it('reports a wired-up error when no preview-cache inspector is injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('list_preview_cache', { cacheDirectory: '/cache' })
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('rejects cache tools without cacheDirectory as -32602', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = await handleViSemanticMcpMessageAsync(cacheCall('list_preview_cache', {}), deps);
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'cacheDirectory' });
    });
  });

  describe('diagnostics tools', () => {
    const toolCall = (name: string, args: unknown, id = 90) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'tools/call' as const,
      params: { name, arguments: args }
    });

    it('projects runtime health through the injected resolver', async () => {
      const resolveRuntimeHealth = vi.fn(async () => ({
        schema: 'vi-history-suite/runtime-health@v1' as const,
        platform: 'linux',
        provider: 'linux-container',
        engine: 'lvcompare-cli' as unknown as string,
        bitness: 'x64',
        containerImage: 'ni/labview:2026q1',
        blocked: false,
        blockedReason: null,
        notes: []
      }));
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('get_runtime_health', { platform: 'linux' }),
          { resolveRuntimeHealth }
        )
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(resolveRuntimeHealth).toHaveBeenCalledWith({ platform: 'linux' });
      expect(response.isError ?? false).toBe(false);
      const parsed = JSON.parse(response.content[0].text) as { schema: string; blocked: boolean };
      expect(parsed.schema).toBe('vi-history-suite/runtime-health@v1');
      expect(parsed.blocked).toBe(false);
    });

    it('surfaces a blocked runtime with its reason', async () => {
      const resolveRuntimeHealth = vi.fn(async () => ({
        schema: 'vi-history-suite/runtime-health@v1' as const,
        platform: 'win32',
        provider: 'unavailable',
        engine: null,
        bitness: 'x64',
        containerImage: null,
        blocked: true,
        blockedReason: 'labview-version-required',
        notes: ['set viHistorySuite.labviewVersion']
      }));
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('get_runtime_health', {}),
          { resolveRuntimeHealth }
        )
      ) as { content: Array<{ text: string }> };
      const parsed = JSON.parse(response.content[0].text) as { blocked: boolean; blockedReason: string };
      expect(parsed.blocked).toBe(true);
      expect(parsed.blockedReason).toBe('labview-version-required');
    });

    it('rejects an invalid platform for get_runtime_health as -32602', async () => {
      const resolveRuntimeHealth = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_runtime_health', { platform: 'solaris' }),
        { resolveRuntimeHealth }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'platform', received: 'string' });
      expect(resolveRuntimeHealth).not.toHaveBeenCalled();
    });

    it('reports a wired-up error when no runtime-health resolver is injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(toolCall('get_runtime_health', {}))
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('returns the preview-diagnostics snapshot through the injected collector', async () => {
      const snapshot = {
        schema: 'vi-history-suite/preview-diagnostics@v1' as const,
        generatedAt: '2026-07-19T00:00:00.000Z',
        runtime: { provider: 'linux-container', outcome: 'ready' as const },
        cache: { directory: '/cache', present: true, entryCount: 2, totalBytes: 2048, newestModifiedAt: null },
        docker: { available: true, osType: 'linux', labviewImages: ['ni/labview:2026q1'] }
      };
      const collectPreviewDiagnostics = vi.fn(async () => snapshot);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('get_preview_diagnostics', { cacheDirectory: '/cache' }),
          { collectPreviewDiagnostics }
        )
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(collectPreviewDiagnostics).toHaveBeenCalledWith({ cacheDirectory: '/cache' });
      expect(response.isError ?? false).toBe(false);
      const parsed = JSON.parse(response.content[0].text) as { schema: string };
      expect(parsed.schema).toBe('vi-history-suite/preview-diagnostics@v1');
    });

    it('rejects an empty cacheDirectory for get_preview_diagnostics as -32602', async () => {
      const collectPreviewDiagnostics = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_preview_diagnostics', { cacheDirectory: '' }),
        { collectPreviewDiagnostics }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({
        field: 'cacheDirectory',
        received: 'empty string'
      });
      expect(collectPreviewDiagnostics).not.toHaveBeenCalled();
    });

    it('reports a wired-up error when no preview-diagnostics collector is injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(toolCall('get_preview_diagnostics', {}))
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    it('lists changed VIs through the injected lister', async () => {
      const listChangedVis = vi.fn(async () => ({
        schema: 'vi-history-suite/changed-vis@v1' as const,
        repositoryRoot: '/repo',
        baseHash: 'aaaa',
        selectedHash: 'bbbb',
        changedVis: ['vis/A.vi', 'vis/B.ctl'],
        count: 2
      }));
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('list_changed_vis', { repositoryRoot: '/repo', baseHash: 'aaaa', selectedHash: 'bbbb' }),
          { listChangedVis }
        )
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(listChangedVis).toHaveBeenCalledWith({
        repositoryRoot: '/repo',
        baseHash: 'aaaa',
        selectedHash: 'bbbb'
      });
      expect(response.isError ?? false).toBe(false);
      const parsed = JSON.parse(response.content[0].text) as { schema: string; count: number };
      expect(parsed.schema).toBe('vi-history-suite/changed-vis@v1');
      expect(parsed.count).toBe(2);
    });

    it('rejects list_changed_vis missing a revision as -32602', async () => {
      const listChangedVis = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('list_changed_vis', { repositoryRoot: '/repo', baseHash: 'aaaa' }),
        { listChangedVis }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'selectedHash' });
      expect(listChangedVis).not.toHaveBeenCalled();
    });

    it('reports a wired-up error when no changed-VI lister is injected', async () => {
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('list_changed_vis', { repositoryRoot: '/repo', baseHash: 'aaaa', selectedHash: 'bbbb' })
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('not wired');
    });

    // VHS-REQ-716.4: the read-only get_vi_generated_code retrieval tool returns
    // the stored lvkit scan through the injected store retriever, reports a store
    // miss as an isError not-found result, and validates its arguments.
    describe('get_vi_generated_code (VHS-REQ-716.4)', () => {
      const envelope = buildLvkitViScanEnvelope({
        viPath: 'resource/A.vi',
        contentSignature: 'sha256:abc123',
        runtime: 'host-native',
        generatedAt: '2026-07-24T11:02:31.000Z',
        lvkitSource: 'path',
        modules: [{ relativePath: 'a/klass/a.py', python: 'def a():\n    return 1\n' }]
      });

      it('returns the stored scan envelope through the injected store retriever', async () => {
        const getViGeneratedCode = vi.fn(async () => ({ status: 'found' as const, envelope }));
        const response = successResult(
          await handleViSemanticMcpMessageAsync(
            toolCall('get_vi_generated_code', {
              viPath: 'resource/A.vi',
              contentSignature: 'sha256:abc123'
            }),
            { getViGeneratedCode }
          )
        ) as { content: Array<{ text: string }>; isError?: boolean };
        expect(getViGeneratedCode).toHaveBeenCalledWith({
          viPath: 'resource/A.vi',
          contentSignature: 'sha256:abc123'
        });
        expect(response.isError ?? false).toBe(false);
        const parsed = JSON.parse(response.content[0].text) as { schema: string; viPath: string };
        expect(parsed.schema).toBe('vi-history-suite/lvkit-vi-scan@v1');
        expect(parsed.viPath).toBe('resource/A.vi');
      });

      it('reports a store miss as an isError not-found result echoing the address', async () => {
        const getViGeneratedCode = vi.fn(async () => ({
          status: 'not-found' as const,
          viPath: 'resource/A.vi',
          contentSignature: 'sha256:missing'
        }));
        const response = successResult(
          await handleViSemanticMcpMessageAsync(
            toolCall('get_vi_generated_code', {
              viPath: 'resource/A.vi',
              contentSignature: 'sha256:missing'
            }),
            { getViGeneratedCode }
          )
        ) as { content: Array<{ text: string }>; isError: boolean };
        expect(response.isError).toBe(true);
        const parsed = JSON.parse(response.content[0].text) as {
          status: string;
          viPath: string;
          contentSignature: string;
        };
        expect(parsed).toEqual({
          status: 'not-found',
          viPath: 'resource/A.vi',
          contentSignature: 'sha256:missing'
        });
      });

      it('rejects get_vi_generated_code missing contentSignature as -32602', async () => {
        const getViGeneratedCode = vi.fn();
        const response = await handleViSemanticMcpMessageAsync(
          toolCall('get_vi_generated_code', { viPath: 'resource/A.vi' }),
          { getViGeneratedCode }
        );
        const error = invalidParamsError(response);
        expect(error.data?.issues?.[0]).toMatchObject({ field: 'contentSignature' });
        expect(getViGeneratedCode).not.toHaveBeenCalled();
      });

      it('reports a wired-up error when no store retriever is injected', async () => {
        const response = successResult(
          await handleViSemanticMcpMessageAsync(
            toolCall('get_vi_generated_code', {
              viPath: 'resource/A.vi',
              contentSignature: 'sha256:abc123'
            })
          )
        ) as { content: Array<{ text: string }>; isError: boolean };
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('not wired');
      });
    });
  });

  describe('prompts', () => {
    const call = (method: string, params: unknown, id = 200) => ({
      jsonrpc: '2.0' as const,
      id,
      method,
      params
    });

    it('lists the guided prompts', () => {
      const result = successResult(handleViSemanticMcpMessage(call('prompts/list', {}))) as {
        prompts: Array<{ name: string }>;
      };
      expect(result.prompts.map((p) => p.name)).toEqual([
        'review_pull_request',
        'explain_vi_history',
        'check_compare_readiness',
        'survey_repository_vis',
        'inspect_vi_change',
        'audit_preview_cache',
        'diagnose_runtime_cache'
      ]);
      expect(result.prompts).toEqual(VI_SEMANTIC_MCP_PROMPTS);
    });

    it('renders review_pull_request naming the tools it chains', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'review_pull_request',
            arguments: { repositoryRoot: '/repo', baseHash: 'aaaa', selectedHash: 'bbbb', maxVis: 25 }
          })
        )
      ) as { messages: Array<{ role: string; content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('list_changed_vis');
      expect(text).toContain('build_vi_pr_review');
      expect(text).toContain('maxVis=25');
      expect(text).toContain('format="markdown"');
    });

    it('renders check_compare_readiness without a platform', () => {
      const result = successResult(
        handleViSemanticMcpMessage(call('prompts/get', { name: 'check_compare_readiness', arguments: {} }))
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('get_runtime_health');
      expect(text).toContain('get_preview_diagnostics');
      expect(text).not.toContain('platform=');
    });

    it('threads platform into BOTH readiness calls when given (#2109)', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', { name: 'check_compare_readiness', arguments: { platform: 'darwin' } })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      // get_runtime_health carries platform, and get_preview_diagnostics carries
      // processPlatform for the same target — no mixed-platform verdict.
      expect(text).toContain('`platform="darwin"`');
      expect(text).toContain('`processPlatform="darwin"`');
    });

    it('renders survey_repository_vis chaining the index into a history drill-down', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'survey_repository_vis',
            arguments: { repositoryRoot: '/repo', maxVis: 40 }
          })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('index_repository_vis');
      expect(text).toContain('summarize_vi_history');
      expect(text).toContain('maxVis=40');
      expect(text).toContain('highest-activity VI');
    });

    it('renders survey_repository_vis drilling into an explicit VI when relativePath is given', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'survey_repository_vis',
            arguments: { repositoryRoot: '/repo', relativePath: 'a/b.vi' }
          })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('the VI at `a/b.vi`');
      expect(text).not.toContain('maxVis=');
    });

    it('renders inspect_vi_change gating on runtime health before comparing', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'inspect_vi_change',
            arguments: { repositoryRoot: '/repo', relativePath: 'a/b.vi', baseHash: 'aaaa', selectedHash: 'bbbb' }
          })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('get_runtime_health');
      expect(text).toContain('compare_vi_revisions');
      expect(text).toContain('relativePath="a/b.vi"');
    });

    it('renders audit_preview_cache chaining diagnostics with a search and runtime correlation', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'audit_preview_cache',
            arguments: { cacheDirectory: '/cache', platform: 'linux' }
          })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('diagnose_preview_cache');
      expect(text).toContain('search_preview_cache');
      expect(text).toContain('get_preview_diagnostics');
      expect(text).toContain('platform="linux"');
    });

    it('renders diagnose_runtime_cache fusing runtime resolution with cache health', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', {
            name: 'diagnose_runtime_cache',
            arguments: { cacheDirectory: '/cache', platform: 'win32' }
          })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('get_preview_diagnostics');
      expect(text).toContain('get_runtime_health');
      expect(text).toContain('diagnose_preview_cache');
      expect(text).toContain('search_preview_cache');
      // Runtime-centric caching states the diagnosis must distinguish.
      expect(text).toContain('COLD');
      expect(text).toContain('BLOCKED');
      expect(text).toContain('BROKEN');
      expect(text).toContain('HEALTHY');
      // The platform flows into both the preview and runtime calls.
      expect(text).toContain('processPlatform="win32"');
      expect(text).toContain('platform="win32"');
    });

    it('renders diagnose_runtime_cache without a platform (no platform clauses)', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('prompts/get', { name: 'diagnose_runtime_cache', arguments: { cacheDirectory: '/cache' } })
        )
      ) as { messages: Array<{ content: { text: string } }> };
      const text = result.messages[0].content.text;
      expect(text).toContain('get_preview_diagnostics');
      expect(text).not.toContain('processPlatform=');
      expect(text).not.toContain('platform=');
    });

    it('rejects prompts/get for an unknown prompt as invalid params', () => {
      expect(
        handleViSemanticMcpMessage(call('prompts/get', { name: 'nope', arguments: {} }))
      ).toMatchObject({ error: { code: -32602 } });
    });

    it('rejects a prompt missing a required argument as -32602 with field detail', () => {
      const error = invalidParamsError(
        handleViSemanticMcpMessage(
          call('prompts/get', { name: 'review_pull_request', arguments: { repositoryRoot: '/repo' } })
        )
      );
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'baseHash' });
    });

    it('every registered prompt renders and enforces its required arguments (design invariant)', () => {
      const KNOWN_TOOL_REFS = VI_SEMANTIC_MCP_TOOLS.map((tool) => tool.name);
      for (const prompt of VI_SEMANTIC_MCP_PROMPTS) {
        const args: Record<string, unknown> = {};
        for (const arg of prompt.arguments) {
          if (arg.required) {
            args[arg.name] = `value-${arg.name}`;
          }
        }
        const rendered = successResult(
          handleViSemanticMcpMessage(call('prompts/get', { name: prompt.name, arguments: args }))
        ) as { messages: Array<{ content: { text: string } }> };
        const text = rendered.messages[0].content.text;
        // Invariant: each prompt references >=2 distinct tools (a real workflow,
        // never a 1:1 wrapper over a single tool).
        const referenced = KNOWN_TOOL_REFS.filter((name) => text.includes(name));
        expect(new Set(referenced).size).toBeGreaterThanOrEqual(2);
        // Every declared required argument is enforced: omitting it yields -32602.
        for (const arg of prompt.arguments) {
          if (!arg.required) {
            continue;
          }
          const withoutOne = { ...args };
          delete withoutOne[arg.name];
          const error = invalidParamsError(
            handleViSemanticMcpMessage(call('prompts/get', { name: prompt.name, arguments: withoutOne }))
          );
          expect(error.data?.issues?.[0]?.field).toBe(arg.name);
        }
      }
    });
  });

  describe('resources', () => {
    const call = (method: string, params: unknown, id = 300) => ({
      jsonrpc: '2.0' as const,
      id,
      method,
      params
    });

    it('lists the schema resources', () => {
      const result = successResult(handleViSemanticMcpMessage(call('resources/list', {}))) as {
        resources: Array<{ uri: string }>;
      };
      expect(result.resources.map((r) => r.uri)).toEqual([
        'vi-history-suite://schema/vi-semantic-comparison@v1',
        'vi-history-suite://schema/vi-semantic-history@v1',
        'vi-history-suite://schema/vi-repository-index@v1',
        'vi-history-suite://schema/vi-preview-comparison-correlation@v1',
        'vi-history-suite://schema/vi-preview-comparison-correlations@v1',
        'vi-history-suite://schema/vi-preview-region-correlation@v2',
        'vi-history-suite://schema/vi-preview-region-correlations@v2',
        'vi-history-suite://schema/vi-latent-corpus-sample@v1',
        'vi-history-suite://schema/vi-latent-corpus-samples@v1',
        'vi-history-suite://schema/vi-preview-region-correlation@v1',
        'vi-history-suite://schema/vi-preview-region-correlations@v1',
        'vi-history-suite://schema/index'
      ]);
      expect(result.resources).toEqual(VI_SEMANTIC_MCP_RESOURCES);
    });

    it('reads a single schema resource by URI', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call('resources/read', { uri: 'vi-history-suite://schema/vi-semantic-comparison@v1' })
        )
      ) as { contents: Array<{ uri: string; mimeType: string; text: string }> };
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/schema+json');
      const schema = JSON.parse(result.contents[0].text) as { $id: string };
      expect(schema.$id).toBe('vi-history-suite/vi-semantic-comparison@v1');
    });

    it('reads the aggregate schema index', () => {
      const result = successResult(
        handleViSemanticMcpMessage(call('resources/read', { uri: 'vi-history-suite://schema/index' }))
      ) as { contents: Array<{ mimeType: string; text: string }> };
      expect(result.contents[0].mimeType).toBe('application/json');
      const map = JSON.parse(result.contents[0].text) as Record<string, unknown>;
      expect(Object.keys(map)).toContain('vi-history-suite/vi-repository-index@v1');
    });

    it('rejects an unknown resource URI as -32602 naming the uri field', () => {
      const error = invalidParamsError(
        handleViSemanticMcpMessage(call('resources/read', { uri: 'vi-history-suite://schema/nope@v9' }))
      );
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'uri' });
    });

    it('every registered resource URI is readable (registry/handler coverage)', () => {
      for (const resource of VI_SEMANTIC_MCP_RESOURCES) {
        const result = successResult(
          handleViSemanticMcpMessage(call('resources/read', { uri: resource.uri }))
        ) as { contents: Array<{ uri: string; text: string }> };
        expect(result.contents[0].uri).toBe(resource.uri);
        expect(() => JSON.parse(result.contents[0].text)).not.toThrow();
      }
    });
  });

  describe('resource templates (fs-backed preview cache)', () => {
    const call = (method: string, params: unknown, id = 400) => ({
      jsonrpc: '2.0' as const,
      id,
      method,
      params
    });
    const previewCacheUri = (key: string, dir: string) =>
      `vi-history-suite://preview-cache/${key}?cacheDirectory=${encodeURIComponent(dir)}`;

    it('lists the preview-cache resource template', () => {
      const result = successResult(handleViSemanticMcpMessage(call('resources/templates/list', {}))) as {
        resourceTemplates: Array<{ uriTemplate: string; mimeType: string }>;
      };
      expect(result.resourceTemplates).toEqual(VI_SEMANTIC_MCP_RESOURCE_TEMPLATES);
      expect(result.resourceTemplates[0].uriTemplate).toContain('vi-history-suite://preview-cache/');
      expect(result.resourceTemplates[0].mimeType).toBe('text/html');
    });

    it('reads a preview-cache entry as HTML through the injected inspector', async () => {
      const get = vi.fn(async () => ({
        key: 'a'.repeat(64),
        filePath: '/cache/x.html',
        bytes: 20,
        inlineImageCount: 1,
        interactive: false,
        flags: [] as never[],
        healthy: true,
        html: '<html>preview</html>'
      }));
      const deps = { previewCacheInspector: { list: vi.fn(), summarize: vi.fn(), search: vi.fn(), get } };
      const uri = previewCacheUri('a'.repeat(64), '/cache');
      const response = successResult(
        await handleViSemanticMcpMessageAsync(call('resources/read', { uri }), deps)
      ) as { contents: Array<{ uri: string; mimeType: string; text: string }> };
      expect(get).toHaveBeenCalledWith('/cache', 'a'.repeat(64), { includeHtml: true });
      expect(response.contents[0].mimeType).toBe('text/html');
      expect(response.contents[0].text).toBe('<html>preview</html>');
      expect(response.contents[0].uri).toBe(uri);
    });

    it('returns -32602 for a preview-cache URI missing cacheDirectory', async () => {
      const deps = { previewCacheInspector: { list: vi.fn(), summarize: vi.fn(), search: vi.fn(), get: vi.fn() } };
      const error = invalidParamsError(
        await handleViSemanticMcpMessageAsync(
          call('resources/read', { uri: 'vi-history-suite://preview-cache/' + 'a'.repeat(64) }),
          deps
        )
      );
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'cacheDirectory' });
      expect(deps.previewCacheInspector.get).not.toHaveBeenCalled();
    });

    it('returns -32602 when the preview-cache entry does not exist', async () => {
      const deps = {
        previewCacheInspector: { list: vi.fn(), summarize: vi.fn(), search: vi.fn(), get: vi.fn(async () => undefined) }
      };
      const response = await handleViSemanticMcpMessageAsync(
        call('resources/read', { uri: previewCacheUri('b'.repeat(64), '/cache') }),
        deps
      );
      const error = invalidParamsError(response);
      expect(error.message).toContain('not found');
    });

    it('errors when no inspector is injected for a preview-cache resource read', async () => {
      const response = await handleViSemanticMcpMessageAsync(
        call('resources/read', { uri: previewCacheUri('c'.repeat(64), '/cache') })
      );
      expect(response).toMatchObject({ error: { code: -32602 } });
      expect((response as { error: { message: string } }).error.message).toContain('async MCP server entrypoint');
    });
  });

  describe('completion/complete', () => {
    const call = (params: unknown, id = 500) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'completion/complete',
      params
    });

    it('completes the check_compare_readiness platform argument', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/prompt', name: 'check_compare_readiness' },
            argument: { name: 'platform', value: 'win' }
          })
        )
      ) as { completion: { values: string[]; total: number; hasMore: boolean } };
      expect(result.completion.values).toEqual(['win32']);
      expect(result.completion.total).toBe(1);
      expect(result.completion.hasMore).toBe(false);
    });

    it('offers all platforms for an empty partial value', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/prompt', name: 'check_compare_readiness' },
            argument: { name: 'platform', value: '' }
          })
        )
      ) as { completion: { values: string[] } };
      expect(result.completion.values).toEqual(['win32', 'linux', 'darwin']);
    });

    it('completes the audit_preview_cache platform argument', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/prompt', name: 'audit_preview_cache' },
            argument: { name: 'platform', value: 'dar' }
          })
        )
      ) as { completion: { values: string[]; total: number } };
      expect(result.completion.values).toEqual(['darwin']);
      expect(result.completion.total).toBe(1);
    });

    it('completes the diagnose_runtime_cache platform argument', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/prompt', name: 'diagnose_runtime_cache' },
            argument: { name: 'platform', value: 'lin' }
          })
        )
      ) as { completion: { values: string[]; total: number } };
      expect(result.completion.values).toEqual(['linux']);
      expect(result.completion.total).toBe(1);
    });

    it('completes schema ids for the schema resource template ref', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/resource', uri: 'vi-history-suite://schema/vi-semantic-comparison@v1' },
            argument: { name: 'uri', value: 'vi-semantic' }
          })
        )
      ) as { completion: { values: string[] } };
      expect(result.completion.values).toContain('vi-semantic-comparison@v1');
      expect(result.completion.values).toContain('vi-semantic-history@v1');
      expect(result.completion.values).not.toContain('vi-repository-index@v1');
    });

    it('completes to nothing for an unknown argument (never errors)', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          call({
            ref: { type: 'ref/prompt', name: 'review_pull_request' },
            argument: { name: 'repositoryRoot', value: '/x' }
          })
        )
      ) as { completion: { values: string[]; total: number } };
      expect(result.completion.values).toEqual([]);
      expect(result.completion.total).toBe(0);
    });

    it('completes to nothing for a malformed request (never errors)', () => {
      const result = successResult(handleViSemanticMcpMessage(call({}))) as {
        completion: { values: string[] };
      };
      expect(result.completion.values).toEqual([]);
    });
  });
});

describe('viSemanticComparisonMcp async argument parsing', () => {
  const toolCall = (name: string, args: unknown, id = 700) => ({
    jsonrpc: '2.0' as const,
    id,
    method: 'tools/call' as const,
    params: { name, arguments: args }
  });
  const noArgsCall = (name: string, id = 701) => ({
    jsonrpc: '2.0' as const,
    id,
    method: 'tools/call' as const,
    params: { name }
  });
  const runtimeHealth = {
    schema: 'vi-history-suite/runtime-health@v1' as const,
    platform: 'linux',
    provider: 'linux-container',
    engine: 'labview-cli' as unknown as string,
    bitness: 'x64',
    containerImage: null,
    blocked: false,
    blockedReason: null,
    notes: []
  };
  const previewDiagnostics = {
    schema: 'vi-history-suite/preview-diagnostics@v1' as const,
    generatedAt: '2026-07-19T00:00:00.000Z',
    runtime: { provider: 'linux-container', outcome: 'ready' as const },
    cache: { directory: '/cache', present: true, entryCount: 1, totalBytes: 1, newestModifiedAt: null },
    docker: { available: true, osType: 'linux', labviewImages: [] }
  };

  describe('get_runtime_health settings argument', () => {
    it('accepts a valid settings object and threads it to the resolver', async () => {
      const resolveRuntimeHealth = vi.fn(async () => runtimeHealth);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('get_runtime_health', { platform: 'linux', settings: { requestedProvider: 'docker' } }),
          { resolveRuntimeHealth }
        )
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(response.isError ?? false).toBe(false);
      expect(resolveRuntimeHealth).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'linux', settings: { requestedProvider: 'docker' } })
      );
    });

    it('returns an empty input object when no arguments are provided', async () => {
      const resolveRuntimeHealth = vi.fn(async () => runtimeHealth);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(noArgsCall('get_runtime_health'), { resolveRuntimeHealth })
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(response.isError ?? false).toBe(false);
      expect(resolveRuntimeHealth).toHaveBeenCalledWith({});
    });

    it('rejects a string settings value as -32602', async () => {
      const resolveRuntimeHealth = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_runtime_health', { settings: 'not-an-object' }),
        { resolveRuntimeHealth }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'settings', received: 'string' });
      expect(resolveRuntimeHealth).not.toHaveBeenCalled();
    });

    it('rejects a null settings value as -32602', async () => {
      const resolveRuntimeHealth = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_runtime_health', { settings: null }),
        { resolveRuntimeHealth }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'settings', received: 'null' });
      expect(resolveRuntimeHealth).not.toHaveBeenCalled();
    });

    it('rejects an array settings value as -32602', async () => {
      const resolveRuntimeHealth = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_runtime_health', { settings: [] }),
        { resolveRuntimeHealth }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'settings', received: 'array' });
      expect(resolveRuntimeHealth).not.toHaveBeenCalled();
    });
  });

  describe('get_preview_diagnostics optional arguments', () => {
    it('threads processPlatform, settings, and connectTimeoutSeconds to the collector', async () => {
      const collectPreviewDiagnostics = vi.fn(async () => previewDiagnostics);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          toolCall('get_preview_diagnostics', {
            cacheDirectory: '/cache',
            processPlatform: 'linux',
            settings: { requestedProvider: 'docker' },
            connectTimeoutSeconds: 42
          }),
          { collectPreviewDiagnostics }
        )
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(response.isError ?? false).toBe(false);
      expect(collectPreviewDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          cacheDirectory: '/cache',
          processPlatform: 'linux',
          settings: { requestedProvider: 'docker' },
          connectTimeoutSeconds: 42
        })
      );
    });

    it('returns an empty options object when no arguments are provided', async () => {
      const collectPreviewDiagnostics = vi.fn(async () => previewDiagnostics);
      const response = successResult(
        await handleViSemanticMcpMessageAsync(noArgsCall('get_preview_diagnostics'), {
          collectPreviewDiagnostics
        })
      ) as { content: Array<{ text: string }>; isError?: boolean };
      expect(response.isError ?? false).toBe(false);
      expect(collectPreviewDiagnostics).toHaveBeenCalledWith({});
    });

    it('rejects a string connectTimeoutSeconds as -32602', async () => {
      const collectPreviewDiagnostics = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_preview_diagnostics', { cacheDirectory: '/cache', connectTimeoutSeconds: 'soon' }),
        { collectPreviewDiagnostics }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({
        field: 'connectTimeoutSeconds',
        received: 'string'
      });
      expect(collectPreviewDiagnostics).not.toHaveBeenCalled();
    });

    it('rejects a non-finite connectTimeoutSeconds as -32602', async () => {
      const collectPreviewDiagnostics = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_preview_diagnostics', {
          cacheDirectory: '/cache',
          connectTimeoutSeconds: Number.POSITIVE_INFINITY
        }),
        { collectPreviewDiagnostics }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({
        field: 'connectTimeoutSeconds',
        received: 'number'
      });
      expect(collectPreviewDiagnostics).not.toHaveBeenCalled();
    });

    it('rejects an array settings value as -32602', async () => {
      const collectPreviewDiagnostics = vi.fn();
      const response = await handleViSemanticMcpMessageAsync(
        toolCall('get_preview_diagnostics', { cacheDirectory: '/cache', settings: [1, 2] }),
        { collectPreviewDiagnostics }
      );
      const error = invalidParamsError(response);
      expect(error.data?.issues?.[0]).toMatchObject({ field: 'settings', received: 'array' });
      expect(collectPreviewDiagnostics).not.toHaveBeenCalled();
    });
  });

  describe('completion/complete argument-shape guards', () => {
    const completeCall = (params: unknown, id = 720) => ({
      jsonrpc: '2.0' as const,
      id,
      method: 'completion/complete' as const,
      params
    });

    it('completes to nothing when the argument is not an object', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          completeCall({
            ref: { type: 'ref/prompt', name: 'check_compare_readiness' },
            argument: 'not-an-object'
          })
        )
      ) as { completion: { values: string[]; total: number } };
      expect(result.completion.values).toEqual([]);
      expect(result.completion.total).toBe(0);
    });

    it('treats a missing argument name as empty (matches no candidate set)', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          completeCall({
            ref: { type: 'ref/prompt', name: 'check_compare_readiness' },
            argument: { value: 'win' }
          })
        )
      ) as { completion: { values: string[] } };
      expect(result.completion.values).toEqual([]);
    });

    it('treats a non-string argument value as an empty partial (offers the full set)', () => {
      const result = successResult(
        handleViSemanticMcpMessage(
          completeCall({
            ref: { type: 'ref/prompt', name: 'check_compare_readiness' },
            argument: { name: 'platform', value: 123 }
          })
        )
      ) as { completion: { values: string[] } };
      expect(result.completion.values).toEqual(['win32', 'linux', 'darwin']);
    });
  });
});
