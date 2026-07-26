#!/usr/bin/env node
// prototype/ml/mcpNarrativeSurfaceAudit.mjs
//
// #2381 BIGGER initiative -- "faithfulness as a governed contract across the WHOLE MCP narrative
// surface". The shipped ordinal fix (PR #2383) hardened the get_vi_semantic_comparison narrative;
// a manual read showed history / repository-index / pr-review narratives compose only meaningful
// denominated counts (and embed the per-VI comparison narrative, which inherits the fix). This
// harness turns that read into a REPEATABLE, EXTENSIBLE audit: for each narrative surface it
// asserts the faithfulness INVARIANTS uniformly --
//   (I1) no invented numbers: every integer > 1 in the narrative is a meaningful count the
//        surface's ground truth allows (the NI-ordinal hazard that bit the comparison narrative);
//   (I2) no false no-change: a narrative for a changed input never claims "no changes/differences";
//   (I3) states the count: a changed narrative cites its headline change count.
//
// This is the WIN-lane seed of the governed contract. Surfaces are pluggable: the COMPARISON
// surface is implemented here over the 8 real NI fixtures (a regression guard for the shipped
// fix); HISTORY / REPO-INDEX / PR-REVIEW plug in via their dependency-injected builders (a
// follow-up lane). Pure over committed fixtures + compiled out/; no network, no runtime.
//
// Run: npm run compile, then node prototype/ml/mcpNarrativeSurfaceAudit.mjs (exits nonzero on any
// invariant violation). Writes prototype/ml/dataset/mcp-narrative-surface-audit.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml } from '../../out/semantic/viSemanticModel.js';
import { buildViSemanticHistory } from '../../out/semantic/viSemanticHistory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'win-lvkit', 'correlation-fixtures');
const OUT = path.join(__dirname, 'dataset', 'mcp-narrative-surface-audit.json');

const NO_CHANGE_RE = /\bno\b[^.]*\b(?:differences?|changes?)\b/i;

/**
 * Assert the faithfulness invariants on one rendered narrative.
 * `allowedNumbers` = the meaningful counts the surface's ground truth permits.
 * `headlineCount` = the count the narrative must state when `hasChanges` (I3); pass null to skip.
 */
export function auditNarrative(narrative, { allowedNumbers, hasChanges, headlineCount }) {
  const text = String(narrative ?? '');
  const allowed = new Set(allowedNumbers.map(Number));
  const invented = (text.match(/\d+/g) || [])
    .map(Number)
    .filter((n) => n > 1 && !allowed.has(n));
  const noInventedNumbers = invented.length === 0;
  // I2: a CHANGED input must not assert "no changes/differences". (The deterministic narratives
  // never quote/refute, so a plain match is a true violation here.)
  const noFalseNoChange = !hasChanges || !NO_CHANGE_RE.test(text);
  // I3: a changed narrative states its headline count.
  const statesCount =
    !hasChanges || headlineCount === null || new RegExp(`\\b${headlineCount}\\b`).test(text);
  return {
    ok: noInventedNumbers && noFalseNoChange && statesCount,
    noInventedNumbers,
    noFalseNoChange,
    statesCount,
    invented
  };
}

// --- COMPARISON surface: audit renderViSemanticNarrative over the 8 real NI fixtures ---
function auditComparisonSurface() {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.labview-diff-report.html'))
    .sort();
  const rows = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    const counts = parseLabviewDiffReportCounts(html);
    const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: file });
    const allowedNumbers = [
      model.totals.detailItemCount,
      model.totals.detailSectionCount,
      model.totals.changedSurfaceCount,
      model.totals.overviewImageCount,
      model.totals.includedAttributeCount,
      model.totals.excludedAttributeCount,
      counts.total,
      counts.cosmetic,
      counts.nonCosmetic
    ];
    const audit = auditNarrative(model.narrative, {
      allowedNumbers,
      hasChanges: model.hasDifferences,
      headlineCount: model.totals.detailItemCount
    });
    rows.push({
      vi: file.replace(/\.labview-diff-report\.html$/i, ''),
      hasDifferences: model.hasDifferences,
      detailItemCount: model.totals.detailItemCount,
      ...audit,
      narrative: model.narrative
    });
  }
  return { surface: 'get_vi_semantic_comparison', tool: 'renderViSemanticNarrative', rows };
}

// --- HISTORY surface: audit renderHistoryNarrative via buildViSemanticHistory with injected
// fakes (unit-testable in isolation per the SRS). A 4-revision timeline (3 compared steps):
// one changing step (front-panel + block-diagram), one blocked, one no-difference. ---
async function auditHistorySurface() {
  const entries = [
    { hash: 'r4', authorDate: '2026-01-04T00:00:00+00:00', authorName: 'Dev', subject: 'tweak' },
    { hash: 'r3', authorDate: '2026-01-03T00:00:00+00:00', authorName: 'Dev', subject: 'refactor' },
    { hash: 'r2', authorDate: '2026-01-02T00:00:00+00:00', authorName: 'Dev', subject: 'wip' },
    { hash: 'r1', authorDate: '2026-01-01T00:00:00+00:00', authorName: 'Dev', subject: 'init' }
  ];
  const completed = (baseHash, surfaces, narrative) => ({
    status: 'completed',
    hasDifferences: surfaces.length > 0,
    model: { revisions: { baseHash }, changedSurfaces: surfaces, narrative, vi: { title: 'Widget.vi' } }
  });
  const resultBySelected = {
    r4: completed('r3', ['front-panel', 'block-diagram'], 'The front panel and block diagram differ.'),
    r3: { status: 'blocked', reason: 'labview-unavailable' },
    r2: completed('r1', [], 'No LabVIEW differences were detected between the two revisions.')
  };
  const deps = {
    getFileHistoryEntries: async () => entries,
    compareViRevisions: async ({ selectedHash }) => resultBySelected[selectedHash]
  };
  const history = await buildViSemanticHistory(
    { repositoryRoot: '/repo', relativePath: 'vis/Widget.vi', maxRevisions: 10 },
    deps
  );
  const t = history.totals;
  const allowedNumbers = [
    history.revisionCount,
    history.comparedStepCount,
    t.changingStepCount,
    t.frontPanelChangeCount,
    t.blockDiagramChangeCount,
    t.connectorPaneChangeCount,
    t.viAttributeChangeCount,
    t.blockedOrFailedStepCount
  ];
  const audit = auditNarrative(history.narrative, {
    allowedNumbers,
    hasChanges: t.changingStepCount > 0,
    headlineCount: t.changingStepCount
  });
  return {
    surface: 'summarize_vi_history',
    tool: 'renderHistoryNarrative',
    rows: [
      {
        vi: 'Widget.vi (synthetic timeline)',
        hasDifferences: t.changingStepCount > 0,
        detailItemCount: t.changingStepCount,
        ...audit,
        narrative: history.narrative
      }
    ]
  };
}

async function main() {
  const surfaces = [auditComparisonSurface(), await auditHistorySurface()];
  // Follow-up lane (pluggable): history / repository-index / pr-review via their injected builders.
  const surfaceSummaries = surfaces.map((s) => {
    const failing = s.rows.filter((r) => !r.ok);
    return {
      surface: s.surface,
      tool: s.tool,
      cases: s.rows.length,
      passing: s.rows.length - failing.length,
      failing: failing.length,
      failingVis: failing.map((r) => r.vi)
    };
  });
  const totalFailing = surfaceSummaries.reduce((a, s) => a + s.failing, 0);
  const report = {
    schema: 'vi-history-suite/mcp-narrative-surface-audit@v1',
    generatedAt: new Date().toISOString(),
    invariants: {
      I1_noInventedNumbers: 'every integer > 1 in a narrative is a meaningful count the ground truth allows',
      I2_noFalseNoChange: 'a changed-input narrative never claims no changes/differences',
      I3_statesCount: 'a changed narrative states its headline change count'
    },
    auditedSurfaces: surfaceSummaries,
    pendingSurfaces: ['index_repository_vis', 'build_vi_pr_review', 'vi-preview-comparison-correlation'],
    totalFailing,
    surfaces
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`MCP_NARRATIVE_SURFACE_AUDIT_DONE totalFailing=${totalFailing}`);
  for (const s of surfaceSummaries) {
    console.log(`- ${s.surface}: ${s.passing}/${s.cases} pass` + (s.failing ? ` FAIL: ${s.failingVis.join(', ')}` : ''));
  }
  if (totalFailing > 0) process.exit(1);
}

// Cross-platform entrypoint check (POSIX file:// vs Windows file:///C:/ ...).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
