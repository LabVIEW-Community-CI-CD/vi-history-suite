#!/usr/bin/env node
// prototype/correlationReport.mjs
//
// #2379 (preview+comparison<->lvkit correlation): assemble the LINUX parser +
// scorer over WIN's benchmark-dataset.json + committed report-HTML fixtures into
// ONE dataset-level correlation report. For every sample whose LabVIEW report
// HTML is committed under the fixtures dir, RE-PARSE it authoritatively (robust
// parser) and override the dataset's PROTOTYPE labview counts; otherwise use the
// dataset counts, flagged `prototype-dataset` (unverified). Emits per-sample
// scores + a dataset calibration summary (mean lvkit/nonCosmetic ratio -> the
// empirical best-fit k that WIN's granularity insight predicts ~1.3).
//
// Pure core (buildCorrelationReport) with injected fs so it is unit-testable; the
// main() wires node fs and prints the report over the committed fixtures.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLabviewDiffReportCounts } from './labviewDiffReportParser.mjs';
import { scoreCorrelation } from './correlationScorer.mjs';

function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

// Fixtures are named <vi-basename-without-.vi, lowercased>.labview-diff-report.html
// (e.g. MouseDown.vi -> mousedown.labview-diff-report.html).
export function fixtureSlug(viPath) {
  const base = String(viPath).split('/').pop() || String(viPath);
  return base.replace(/\.vi$/i, '').toLowerCase();
}

function countKind(kinds, kind) {
  return (Array.isArray(kinds) ? kinds : []).filter((k) => k === kind).length;
}

/**
 * Build a dataset-level correlation report. `deps.readFile(path)->string` and
 * `deps.exists(path)->boolean` are injected. `calibrationK` is passed to the
 * scorer's countAgreement (default 1 = strict).
 */
export function buildCorrelationReport(dataset, fixturesDir, deps, calibrationK = 1) {
  if (!dataset || !Array.isArray(dataset.samples)) {
    throw new Error('correlation-report: dataset.samples must be an array');
  }
  const samples = dataset.samples.map((s) => {
    const htmlPath = path.join(fixturesDir, `${fixtureSlug(s.vi)}.labview-diff-report.html`);
    let labview;
    let labviewSource;
    if (deps.exists(htmlPath)) {
      labview = parseLabviewDiffReportCounts(deps.readFile(htmlPath));
      labviewSource = 'robust-parser';
    } else {
      labview = {
        total: s.labview?.differenceBlocks ?? 0,
        cosmetic: s.labview?.cosmetic ?? 0,
        nonCosmetic: s.labview?.nonCosmetic ?? 0
      };
      labviewSource = 'prototype-dataset';
    }
    const score = scoreCorrelation({
      lvkit: {
        changeCount: s.lvkit?.changeCount ?? 0,
        addedNodes: countKind(s.lvkit?.kinds, 'added'),
        removedNodes: countKind(s.lvkit?.kinds, 'removed')
      },
      labview,
      preview: { deltaInlineImages: s.preview?.deltaInlineImages },
      calibrationK
    });
    return {
      vi: s.vi,
      labviewSource,
      lvkitChangeCount: s.lvkit?.changeCount ?? 0,
      labview: { total: labview.total, cosmetic: labview.cosmetic, nonCosmetic: labview.nonCosmetic },
      composite: score.composite,
      countAgreement: score.terms.countAgreement.value,
      ratio: score.terms.countAgreement.ratio,
      cosmeticAxis: labview.cosmetic
    };
  });
  const ratios = samples.map((s) => s.ratio).filter((r) => typeof r === 'number' && r > 0);
  const meanRatio = ratios.length ? round4(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null;
  return {
    schema: 'vi-history-suite/preview-compare-lvkit-correlation-report@v1',
    calibrationK,
    sampleCount: samples.length,
    samples,
    calibration: {
      meanRatio,
      // Empirical best-fit k: the multiplier that makes lvkit ~ k*nonCosmetic on
      // average (WIN predicted ~1.3; converges as robust-parser samples grow).
      empiricalBestFitK: meanRatio,
      verifiedSamples: samples.filter((s) => s.labviewSource === 'robust-parser').length,
      prototypeSamples: samples.filter((s) => s.labviewSource === 'prototype-dataset').length
    }
  };
}

function main() {
  const datasetPath =
    process.argv[2] || 'prototype/win-lvkit/correlation-fixtures/benchmark-dataset.json';
  const fixturesDir = process.argv[3] || path.dirname(datasetPath);
  const calibrationK = process.argv[4] ? Number(process.argv[4]) : 1;
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const report = buildCorrelationReport(
    dataset,
    fixturesDir,
    { readFile: (p) => fs.readFileSync(p, 'utf8'), exists: (p) => fs.existsSync(p) },
    calibrationK
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
