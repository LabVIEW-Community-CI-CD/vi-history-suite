// Real-agent MCP validation (VHS-REQ-712): drives the shipped VI semantic MCP
// server as a REAL Model Context Protocol client using the official
// @modelcontextprotocol/sdk, with the LabVIEW-free lvkit backend enabled
// (VIHS_SEMANTICS_PROVIDER=lvkit). It proves that an agent (e.g. Copilot) talking
// MCP to this server gets a real lvkit-backed semantic comparison — no LabVIEW,
// no Docker — for the compare_vi_revisions tool.
//
// Maintainer harness (.mjs, inventory-exempt); not shipped, not in npm test. Run
// from the repo root AFTER `npm run compile`, with lvkit on PATH
// (`uv tool install lvkit`):
//   node scripts/lvkitMcpAgentValidation.mjs
//
// Env:
//   LVKIT_MCP_REPO   git repo holding the VI (default the icon-editor clone)
//   LVKIT_MCP_VI     repo-relative .vi path (default resource/plugins/lv_icon.vi)
//   LVKIT_MCP_BASE   base git revision
//   LVKIT_MCP_SEL    selected git revision
//   LVKIT_MCP_OUT    evidence JSON path
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repoRoot = process.env.LVKIT_MCP_REPO || path.join(process.env.HOME || '', 'repos', 'labview-icon-editor');
const relativePath = process.env.LVKIT_MCP_VI || 'resource/plugins/lv_icon.vi';
const baseHash = process.env.LVKIT_MCP_BASE || '537683398d8c';
const selectedHash = process.env.LVKIT_MCP_SEL || 'fc09736ae5e3';
const outPath = process.env.LVKIT_MCP_OUT || path.join(process.cwd(), 'lin-validation', 'lvkit-mcp', 'lvkit-mcp-agent-evidence.json');

const serverEntry = path.join(process.cwd(), 'out', 'cli', 'runViSemanticMcpServer.js');
if (!fs.existsSync(serverEntry)) {
  console.error(`[lvkit-mcp] missing ${serverEntry}; run \`npm run compile\` first.`);
  process.exit(2);
}

// Ensure lvkit (installed via `uv tool install lvkit`) is on the server's PATH.
const localBin = path.join(process.env.HOME || '', '.local', 'bin');
const childEnv = {
  ...process.env,
  VIHS_SEMANTICS_PROVIDER: 'lvkit',
  PATH: `${localBin}${path.delimiter}${process.env.PATH || ''}`
};

function textContent(result) {
  const block = (result?.content || []).find((c) => c.type === 'text');
  return block ? block.text : '';
}

async function main() {
  const evidence = {
    $schema: 'vi-history-suite/lvkit-mcp-agent-evidence@v1',
    generatedAt: new Date().toISOString(),
    transport: 'stdio',
    sdk: '@modelcontextprotocol/sdk',
    provider: 'lvkit',
    corpus: { repoRoot, relativePath, baseHash, selectedHash },
    ok: false,
    toolListed: false,
    compareStatus: null,
    model: null,
    error: null
  };

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: childEnv,
    stderr: 'pipe'
  });
  const client = new Client({ name: 'lvkit-mcp-agent-validation', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = (tools.tools || []).map((t) => t.name);
    evidence.toolListed = names.includes('compare_vi_revisions');
    if (!evidence.toolListed) {
      throw new Error(`compare_vi_revisions not advertised; tools=${names.join(',')}`);
    }

    console.error('[lvkit-mcp] calling compare_vi_revisions over MCP (lvkit backend, LabVIEW-free)...');
    const result = await client.callTool({
      name: 'compare_vi_revisions',
      arguments: { repositoryRoot: repoRoot, relativePath, baseHash, selectedHash }
    });

    // The handler returns the semantic MODEL JSON directly on success, or an
    // isError text message ("Comparison <status>: <reason>") on failure.
    const text = textContent(result);
    console.error(`[lvkit-mcp] raw tool content (first 300): ${text.slice(0, 300)}`);
    if (result.isError === true || text.startsWith('Comparison ')) {
      evidence.compareStatus = 'not-completed';
      evidence.error = text;
    } else {
      const model = JSON.parse(text);
      evidence.compareStatus = 'completed';
      evidence.model = model;
      const rt = model.runtime || {};
      evidence.ok =
        rt.provider === 'lvkit' &&
        model.schema === 'vi-history-suite/vi-semantic-comparison@v1' &&
        Array.isArray(model.changedSurfaces);
    }
  } catch (error) {
    evidence.error = error && error.message ? error.message : String(error);
    console.error(`[lvkit-mcp] ERROR: ${evidence.error}`);
  } finally {
    await client.close().catch(() => undefined);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  const m = evidence.model || {};
  console.log(
    JSON.stringify(
      {
        ok: evidence.ok,
        transport: 'stdio (real MCP SDK client)',
        toolListed: evidence.toolListed,
        compareStatus: evidence.compareStatus,
        runtimeProvider: (m.runtime || {}).provider,
        hasDifferences: m.hasDifferences,
        changedSurfaces: m.changedSurfaces,
        changeKinds: m.changeKinds,
        riskLevel: m.riskLevel,
        narrative: m.narrative
      },
      null,
      2
    )
  );
  console.error(`[lvkit-mcp] evidence -> ${path.relative(process.cwd(), outPath)}`);
  process.exitCode = evidence.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`[lvkit-mcp] FATAL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
