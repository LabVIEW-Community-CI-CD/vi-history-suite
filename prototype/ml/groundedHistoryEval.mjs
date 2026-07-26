#!/usr/bin/env node
// prototype/ml/groundedHistoryEval.mjs
//
// #2381 mcp-faithfulness-surface, LINUX lane (2nd surface): does the OPTIONAL grounded 8b-2shot
// narrator help (or HAZARD) the HISTORY TIMELINE narrative -- the summarize_vi_history reviewer
// summary across a VI's revisions? Like the PR-review aggregate, the timeline is a CROSS-item
// roll-up where a model might invent a cross-revision total (the noInventedNumbers hazard).
//
// Reuses WIN's EXACT injected synthetic timeline from mcpNarrativeSurfaceAudit.auditHistorySurface
// (buildViSemanticHistory with fake getFileHistoryEntries/compareViRevisions) so the grounded
// eval and the deterministic audit share one ground truth. Renders the deterministic history
// narrative as the faithful fallback, generates a grounded timeline summary via 8b-2shot (BASELINE
// SYSTEM only), and gates with the SHARED narrativeQualityGate contract (I1/I2/I3). allowedNumbers
// = the history rollup counts; any other integer > 1 in the grounded summary is an INVENTED
// cross-revision number.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildViSemanticHistory } from '../../out/semantic/viSemanticHistory.js';
import { scoreNarrative, selectFaithfulNarrative } from './narrativeQualityGate.mjs';
import { createOllamaGenerate } from './groundedNarrativeProvider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Optional VIHS_SWEEP_LABEL host/backend suffix (mirrors groundedProviderSweep) so CPU vs GPU
// evidence do not clobber: e.g. VIHS_SWEEP_LABEL=win-cpu -> ollama-grounded-history-eval-win-cpu.json.
// VIHS_EVAL_HOST / VIHS_EVAL_BACKEND record the run host/backend in the report (default LINUX/gpu).
const SWEEP_LABEL = (process.env.VIHS_SWEEP_LABEL || '').replace(/[^a-z0-9._-]/gi, '');
const EVAL_HOST = process.env.VIHS_EVAL_HOST || 'LINUX';
const EVAL_BACKEND = process.env.VIHS_EVAL_BACKEND || 'gpu';
const OUT = path.join(__dirname, 'dataset', `ollama-grounded-history-eval${SWEEP_LABEL ? `-${SWEEP_LABEL}` : ''}.json`);
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.HIST_MODEL || 'vichange8b-2shot';
const HIST_SCORE_KEYS = ['statesStructuralCount', 'noFalseNoChange', 'noInventedNumbers'];

// WIN's exact injected synthetic timeline (mcpNarrativeSurfaceAudit.auditHistorySurface).
async function buildHistory() {
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
  return buildViSemanticHistory({ repositoryRoot: '/repo', relativePath: 'vis/Widget.vi', maxRevisions: 10 }, deps);
}

function historyFacts(h) {
  const t = h.totals;
  const surfaces = [
    t.frontPanelChangeCount > 0 ? `front panel (${t.frontPanelChangeCount})` : null,
    t.blockDiagramChangeCount > 0 ? `block diagram (${t.blockDiagramChangeCount})` : null,
    t.connectorPaneChangeCount > 0 ? `connector pane (${t.connectorPaneChangeCount})` : null,
    t.viAttributeChangeCount > 0 ? `VI attributes (${t.viAttributeChangeCount})` : null
  ].filter(Boolean).join(', ') || 'none';
  return [
    `Revision history of ${h.vi.title ?? h.vi.relativePath}:`,
    `- revisions on record: ${h.revisionCount}`,
    `- compared revision steps: ${h.comparedStepCount}`,
    `- steps that changed the VI: ${t.changingStepCount}`,
    `- surfaces changed (with step counts): ${surfaces}`,
    `- steps blocked or failed to compare: ${t.blockedOrFailedStepCount}`
  ].join('\n');
}

const HIST_PROMPT =
  'Summarize this VI revision history for a code reviewer: how many revision steps were compared, how many changed the VI, which surfaces changed, and any steps that could not be compared. Use ONLY the numbers provided; do NOT invent any total or combined count across revisions.';

async function main() {
  const h = await buildHistory();
  const t = h.totals;
  const template = h.narrative;
  const allowedNumbers = [
    h.revisionCount, h.comparedStepCount, t.changingStepCount,
    t.frontPanelChangeCount, t.blockDiagramChangeCount, t.connectorPaneChangeCount,
    t.viAttributeChangeCount, t.blockedOrFailedStepCount
  ];
  const groundTruth = { lvkitChangeCount: t.changingStepCount, kinds: [], allowedNumbers };
  const templateScored = scoreNarrative(template, groundTruth, HIST_SCORE_KEYS);

  let present = false;
  try {
    const tags = await (await fetch(`${OLLAMA}/api/tags`)).json();
    present = (tags.models || []).some((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  } catch { present = false; }

  let grounded = null;
  let selection = null;
  if (present) {
    const generate = createOllamaGenerate({ ollamaUrl: OLLAMA, model: MODEL });
    const text = await generate(HIST_PROMPT, historyFacts(h));
    const scored = scoreNarrative(text, groundTruth, HIST_SCORE_KEYS);
    const allowedSet = new Set(allowedNumbers.map(Number));
    const invented = (text.match(/\d+/g) || []).map(Number).filter((n) => n > 1 && !allowedSet.has(n));
    grounded = { narrative: text, score: scored.score, failedParts: scored.failedParts, invented };
    selection = selectFaithfulNarrative({ candidate: text, fallback: template, groundTruth, scoreKeys: HIST_SCORE_KEYS });
  }

  const report = {
    schema: 'vi-history-suite/ollama-grounded-history-eval@v1',
    generatedAt: new Date().toISOString(),
    host: EVAL_HOST, backend: EVAL_BACKEND, label: SWEEP_LABEL || null, ollamaUrl: OLLAMA, model: MODEL, surface: 'summarize_vi_history',
    timeline: 'synthetic (WIN audit fake: 4 revisions, 1 changing, 1 blocked, 1 no-difference)',
    headlineChangingStepCount: t.changingStepCount,
    allowedNumbers,
    template: { narrative: template, score: templateScored.score, failedParts: templateScored.failedParts },
    grounded,
    selection: selection ? { source: selection.source, reason: selection.reason, candidateScore: selection.candidateScore, fallbackScore: selection.fallbackScore } : null,
    note: 'History TIMELINE (cross-revision) reviewer summary. allowedNumbers = history rollup counts; any other integer > 1 in the grounded summary is an INVENTED cross-revision number. Synthetic timeline reused from WIN mcpNarrativeSurfaceAudit for lane consistency. BASELINE SYSTEM only.'
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

  console.log(`GROUNDED_HISTORY_EVAL_DONE surface=summarize_vi_history changingSteps=${t.changingStepCount} model=${present ? MODEL : '(absent)'}`);
  console.log(`template: score=${templateScored.score} narrative=${JSON.stringify(template)}`);
  if (grounded) {
    console.log(`grounded: score=${grounded.score} failedParts=[${grounded.failedParts.join(',')}] invented=[${grounded.invented.join(',')}]`);
    console.log(`selection: ${selection.source} (${selection.reason})`);
    console.log(`grounded narrative: ${JSON.stringify(grounded.narrative.slice(0, 400))}`);
  } else {
    console.log('grounded: (no backend -- template-only)');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
