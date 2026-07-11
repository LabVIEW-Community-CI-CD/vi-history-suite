import { describe, expect, it } from 'vitest';

import {
  handleViSemanticMcpMessage,
  JsonRpcSuccess,
  VI_SEMANTIC_MCP_PROTOCOL_VERSION,
  VI_SEMANTIC_MCP_SERVER_INFO,
  VI_SEMANTIC_MCP_TOOLS
} from '../../src/semantic/viSemanticComparisonMcp';
import { VI_SEMANTIC_COMPARISON_SCHEMA } from '../../src/semantic/viSemanticModel';

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
      'get_vi_semantic_comparison'
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
});
