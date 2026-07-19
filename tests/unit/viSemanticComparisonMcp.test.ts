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
  VI_SEMANTIC_MCP_TOOLS
} from '../../src/semantic/viSemanticComparisonMcp';
import type { CompareViRevisionsResult } from '../../src/semantic/compareViRevisions';
import type { ViSemanticHistory } from '../../src/semantic/viSemanticHistory';
import type { ViRepositoryIndex } from '../../src/semantic/viRepositoryIndex';
import type { ViSemanticPrReview } from '../../src/semantic/viSemanticPrReview';
import {
  buildViSemanticComparisonModelFromHtml,
  VI_SEMANTIC_COMPARISON_SCHEMA
} from '../../src/semantic/viSemanticModel';

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

describe('viSemanticComparisonMcp', () => {
  it('answers the initialize handshake with protocol and server info', () => {
    const result = successResult(
      handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    ) as Record<string, unknown>;
    expect(result.protocolVersion).toBe(VI_SEMANTIC_MCP_PROTOCOL_VERSION);
    expect(result.serverInfo).toEqual(VI_SEMANTIC_MCP_SERVER_INFO);
    expect(result.capabilities).toMatchObject({ tools: {} });
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
      'get_preview_cache_entry'
    ]);
    expect(result.tools).toEqual(VI_SEMANTIC_MCP_TOOLS);
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

  it('reports a tool error through the result envelope for invalid arguments', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'summarize_vi_comparison', arguments: { reportHtml: '' } }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('reportHtml is required');
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
      handleViSemanticMcpMessage({ jsonrpc: '2.0', id: 9, method: 'resources/list' })
    ).toMatchObject({ error: { code: -32601, message: 'unknown method: resources/list' } });
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

    const unknown = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 62,
        method: 'tools/call',
        params: { name: 'get_vi_semantic_schema', arguments: { schema: 'nope@v9' } }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toContain('unknown schema');
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

  it('reports a tool error when validate_vi_semantic_document lacks a document', () => {
    const result = successResult(
      handleViSemanticMcpMessage({
        jsonrpc: '2.0',
        id: 65,
        method: 'tools/call',
        params: { name: 'validate_vi_semantic_document', arguments: {} }
      })
    ) as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('document is required');
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
          reportType: 'gui',
          runtime: { provider: 'linux-container' }
        }),
        { compareViRevisions }
      );
      expect(compareViRevisions).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'gui',
          runtime: { provider: 'linux-container' }
        })
      );
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
      const response = successResult(
        await handleViSemanticMcpMessageAsync(compareCall({ repositoryRoot: '/repo' }), {
          compareViRevisions
        })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('relativePath is required');
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
      const response = successResult(
        await handleViSemanticMcpMessageAsync(historyCall({ repositoryRoot: '/repo' }), {
          buildViSemanticHistory
        })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('relativePath is required');
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
      const response = successResult(
        await handleViSemanticMcpMessageAsync(indexCall({}), { buildViRepositoryIndex })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('repositoryRoot is required');
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
      const response = successResult(
        await handleViSemanticMcpMessageAsync(prReviewCall({ repositoryRoot: '/repo' }), {
          buildViSemanticPrReview
        })
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('baseHash is required');
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
        flagged: [{ key: 'b'.repeat(64), flags: ['error-marker' as const] }]
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
      const parsed = JSON.parse(response.content[0].text) as { schema: string; healthy: boolean };
      expect(parsed.schema).toBe('vi-history-suite/preview-cache-diagnostics@v1');
      expect(parsed.healthy).toBe(false);
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

    it('rejects an unknown search marker', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(
          cacheCall('search_preview_cache', { cacheDirectory: '/cache', marker: 'nope' }),
          deps
        )
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('marker must be one of');
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

    it('requires cacheDirectory for cache tools', async () => {
      const deps = { previewCacheInspector: inspector() };
      const response = successResult(
        await handleViSemanticMcpMessageAsync(cacheCall('list_preview_cache', {}), deps)
      ) as { content: Array<{ text: string }>; isError: boolean };
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('cacheDirectory is required');
    });
  });
});
