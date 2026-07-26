#!/usr/bin/env node
// prototype/ml/groundedProviderSweep.mjs
//
// #2381 next thread -- exercises the OPTIONAL grounded MCP narrative provider
// (groundedNarrativeProvider.mjs) across the available ollama configs over the 8 real NI
// comparison-report fixtures, using the shipped deterministic template as the fallback.
//
// For each fixture it builds the real semantic model (compiled out/) -> the shipped template
// narrative + the MCP-native structural count; parses the cosmetic tally (labviewDiffReportParser);
// then for each PRESENT config runs selectMcpNarrative with a real ollama backend and records
// whether the grounded narrative was ACCEPTED by the faithfulness gate or fell back to the
// template (and why). The provider question this answers: which model is the best OPTIONAL
// readability layer -- i.e. passes the gate most often without regressing the template -- given
// the deterministic template already clears the bar (PR #2383).
//
// GPU lane (LINUX): `npm run compile` then `node prototype/ml/groundedProviderSweep.mjs`.
// Falls back to template-only (accept-rate 0, reason no-backend) when a config is absent, so it
// runs anywhere. Writes prototype/ml/dataset/ollama-grounded-provider-sweep.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from '../labviewDiffReportParser.mjs';
import { buildViSemanticComparisonModelFromHtml } from '../../out/semantic/viSemanticModel.js';
import { selectMcpNarrative, createOllamaGenerate } from './groundedNarrativeProvider.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'win-lvkit', 'correlation-fixtures');
const OUT = path.join(__dirname, 'dataset', 'ollama-grounded-provider-sweep.json');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';

// id -> ollama model name. Absent models are skipped (marked present:false).
const CONFIGS = [
  { id: '8b-raw', model: 'llama3.1:8b' },
  { id: '8b-fewshot', model: 'vichange8b-fewshot' },
  { id: '8b-2shot', model: 'vichange8b-2shot' },
  { id: '14b', model: 'qwen2.5:14b' }
];

async function presentModels() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`);
    const j = await r.json();
    return new Set((j.models || []).map((m) => m.name));
  } catch {
    return new Set();
  }
}

function isPresent(present, model) {
  return present.has(model) || present.has(`${model}:latest`);
}

async function main() {
  const present = await presentModels();
  const files = fs
    .readdirSync(FIXTURES)
    .filter((f) => f.endsWith('.labview-diff-report.html'))
    .sort();

  // Pre-build the per-fixture model + template + cosmetic tally once (model-independent).
  const fixtures = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    try {
      const counts = parseLabviewDiffReportCounts(html);
      const model = buildViSemanticComparisonModelFromHtml(html, { reportFilePath: file });
      fixtures.push({
        vi: file.replace(/\.labview-diff-report\.html$/i, ''),
        model,
        templateNarrative: model.narrative,
        cosmeticCount: counts.cosmetic
      });
    } catch (ex) {
      fixtures.push({ vi: file, error: String(ex) });
    }
  }
  const scored = fixtures.filter((f) => !f.error);

  const configReports = [];
  for (const cfg of CONFIGS) {
    const configPresent = isPresent(present, cfg.model);
    const generate = configPresent ? createOllamaGenerate({ ollamaUrl: OLLAMA, model: cfg.model }) : undefined;
    const rows = [];
    for (const f of scored) {
      const res = await selectMcpNarrative({
        model: f.model,
        cosmeticCount: f.cosmeticCount,
        templateNarrative: f.templateNarrative,
        generate
      });
      rows.push({
        vi: f.vi,
        source: res.source,
        reason: res.reason,
        templateScore: res.template.score,
        groundedScore: res.grounded ? res.grounded.score : null,
        groundedNarrative: res.grounded ? res.grounded.narrative : null
      });
    }
    const accepted = rows.filter((r) => r.source === 'grounded');
    const reasons = {};
    for (const r of rows) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const meanGrounded =
      accepted.length > 0
        ? Math.round((accepted.reduce((a, r) => a + (r.groundedScore ?? 0), 0) / accepted.length) * 1000) / 1000
        : null;
    configReports.push({
      id: cfg.id,
      model: cfg.model,
      present: configPresent,
      viCount: rows.length,
      acceptedCount: accepted.length,
      acceptRate: rows.length ? Math.round((accepted.length / rows.length) * 1000) / 1000 : null,
      meanAcceptedGroundedScore: meanGrounded,
      reasons,
      sampleAcceptedNarrative: accepted.length ? accepted[0].groundedNarrative : null,
      rows
    });
  }

  const report = {
    schema: 'vi-history-suite/grounded-provider-sweep@v1',
    generatedAt: new Date().toISOString(),
    ollama: OLLAMA,
    note:
      'Optional grounded MCP narrative provider sweep. Per config: acceptRate = fraction of fixtures where the grounded narrative cleared the faithfulness safety gate without regressing the shipped template; otherwise the provider falls back to the deterministic template.',
    viCount: scored.length,
    configs: configReports
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`GROUNDED_PROVIDER_SWEEP_DONE vis=${scored.length} ollama=${OLLAMA}`);
  console.log('| config | present | acceptRate | meanGrndScore | reasons |');
  console.log('|---|---|---|---|---|');
  for (const c of configReports) {
    const reasons = Object.entries(c.reasons).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(
      `| ${c.id} | ${c.present} | ${c.acceptRate ?? 'n/a'} | ${c.meanAcceptedGroundedScore ?? 'n/a'} | ${reasons} |`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
