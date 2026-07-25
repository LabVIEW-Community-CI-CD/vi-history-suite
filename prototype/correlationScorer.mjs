#!/usr/bin/env node
// prototype/correlationScorer.mjs
//
// #2378 (preview+comparison<->lvkit correlation): pure, deterministic scorer
// that correlates the THREE oracles for one revision pair and emits a
// schema-versioned score packet. Correlation is a GRANULARITY MAPPING, not a
// 1:1 count equality (the trap): lvkit's structural changeCount aligns with the
// LabVIEW NON-cosmetic count; the LabVIEW cosmetic count is a SEPARATE axis
// lvkit omits by design.
//
// Rubric (WIN's split):
//   composite = 0.5 * countAgreement       (lvkit.changeCount  vs labview.nonCosmetic)
//             + 0.3 * setAgreement          (Jaccard of matched change sets, else cardinality proxy)
//             + 0.2 * structuralCardinality (preview inline-image delta vs lvkit net node delta)
// cosmetic count is reported on its own axis (never folded into the score);
// every axis disagreement is surfaced explicitly.

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// [0,1] closeness: 1 when equal (incl. both 0), decaying by relative gap.
export function agreementRatio(a, b) {
  const x = toFiniteNumber(a);
  const y = toFiniteNumber(b);
  if (x === 0 && y === 0) return 1;
  const score = 1 - Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1);
  return score < 0 ? 0 : score > 1 ? 1 : score;
}

function round4(n) {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Score the correlation for one revision pair.
 * @param {object} input
 * @param {{changeCount:number, addedNodes?:number, removedNodes?:number}} input.lvkit
 * @param {{total:number, cosmetic:number, nonCosmetic:number}} input.labview
 * @param {{deltaInlineImages?:number}} [input.preview]
 * @param {{intersection:number, union:number}} [input.matchedPairs] optional true set match
 */
export function scoreCorrelation(input = {}) {
  const lvkit = input.lvkit || {};
  const labview = input.labview || {};
  const preview = input.preview || {};

  const lvkitChangeCount = toFiniteNumber(lvkit.changeCount);
  const labviewNonCosmetic = toFiniteNumber(labview.nonCosmetic);
  const labviewCosmetic = toFiniteNumber(labview.cosmetic);

  // 0.5 countAgreement: the PRIMARY structural axis.
  const countAgreement = agreementRatio(lvkitChangeCount, labviewNonCosmetic);

  // 0.3 setAgreement: Jaccard when a true matched set is supplied, else a
  // transparent cardinality proxy (flagged so a consumer never mistakes it for
  // a real entity-level match).
  let setAgreement;
  let setAgreementBasis;
  const mp = input.matchedPairs;
  if (mp && Number.isFinite(mp.intersection) && Number.isFinite(mp.union) && mp.union > 0) {
    setAgreement = mp.intersection / mp.union;
    setAgreementBasis = 'jaccard';
  } else {
    setAgreement = agreementRatio(lvkitChangeCount, labviewNonCosmetic);
    setAgreementBasis = 'cardinality-proxy';
  }

  // 0.2 structuralCardinality: preview inline-image delta vs lvkit NET node
  // delta (added - removed). Both are small signed magnitudes that should track.
  const previewDelta = toFiniteNumber(preview.deltaInlineImages);
  const netNodeDelta = toFiniteNumber(lvkit.addedNodes) - toFiniteNumber(lvkit.removedNodes);
  const structuralCardinality = agreementRatio(Math.abs(previewDelta), Math.abs(netNodeDelta));

  const composite = round4(0.5 * countAgreement + 0.3 * setAgreement + 0.2 * structuralCardinality);

  const disagreements = [];
  if (lvkitChangeCount !== labviewNonCosmetic) {
    disagreements.push({
      axis: 'count',
      detail: `lvkit changeCount ${lvkitChangeCount} vs labview nonCosmetic ${labviewNonCosmetic} (delta ${lvkitChangeCount - labviewNonCosmetic})`
    });
  }
  if (Math.abs(previewDelta) !== Math.abs(netNodeDelta)) {
    disagreements.push({
      axis: 'structuralCardinality',
      detail: `preview |delta inline images| ${Math.abs(previewDelta)} vs lvkit |net node delta| ${Math.abs(netNodeDelta)}`
    });
  }

  return {
    schema: 'vi-history-suite/preview-compare-lvkit-correlation-score@v1',
    composite,
    terms: {
      countAgreement: { weight: 0.5, value: round4(countAgreement), a: lvkitChangeCount, b: labviewNonCosmetic },
      setAgreement: { weight: 0.3, value: round4(setAgreement), basis: setAgreementBasis },
      structuralCardinality: {
        weight: 0.2,
        value: round4(structuralCardinality),
        previewDelta,
        netNodeDelta
      }
    },
    // Cosmetic is a SEPARATE axis (LabVIEW-only, lvkit omits by design) -- never
    // folded into the composite; reported so a consumer sees the granularity gap.
    cosmeticAxis: { labviewCosmetic, note: 'LabVIEW-only cosmetic (position/appearance) diffs; lvkit omits by design' },
    disagreements
  };
}

function main() {
  console.error('correlationScorer is a library; import scoreCorrelation. See tests/unit/labviewCorrelation.test.ts.');
  process.exit(2);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
