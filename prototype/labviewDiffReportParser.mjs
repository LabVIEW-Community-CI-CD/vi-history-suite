#!/usr/bin/env node
// prototype/labviewDiffReportParser.mjs
//
// #2378 (preview+comparison<->lvkit correlation): pure parser that extracts the
// difference-count profile { total, cosmetic, nonCosmetic } from a real LabVIEW
// `CreateComparisonReport` HTML, using LabVIEW's OWN heading class tags:
//
//   class="difference"                  -> one difference BLOCK  (total)
//   <summary class="difference-heading">        N. ...  -> a NON-cosmetic block
//   <summary class="difference-cosmetic-heading"> N. ... -> a COSMETIC block
//
// The report also carries ONE non-numbered `difference-heading` summary that is
// the report header ("First VI: <path> ... Second VI: <path>"); it is excluded
// by the numbered-label rule (a real difference heading starts "N.").
//
// This is the granularity-aware counterpart of lvkit's structural diff: lvkit's
// structural changeCount aligns with the NON-cosmetic count; the cosmetic count
// is a SEPARATE axis lvkit omits by design (see correlationScorer.mjs). Pure +
// deterministic; the parse fn takes html text and does no I/O.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCK_CLASS_RE = /class="difference"/g;
const HEADING_RE =
  /<summary\b[^>]*\bclass="(difference-heading|difference-cosmetic-heading)"[^>]*>([\s\S]*?)<\/summary>/gi;
const NUMBERED_LABEL_RE = /^\d+\./;

function stripTags(fragment) {
  return fragment.replace(/<[^>]*>/g, '');
}

function normalizeLabel(fragment) {
  return stripTags(fragment).replace(/\s+/g, ' ').trim();
}

/**
 * Parse a LabVIEW comparison-report HTML into a difference-count profile.
 * Throws on non-string / empty input (fail-closed). `consistent` is false when
 * the classified headings do not sum to the difference-block total, so a
 * consumer can surface an unrecognized report shape rather than trust a wrong
 * split.
 */
export function parseLabviewDiffReportCounts(html) {
  if (typeof html !== 'string' || html.length === 0) {
    throw new Error('labview-diff-report: html must be a non-empty string');
  }
  const total = (html.match(BLOCK_CLASS_RE) || []).length;

  let cosmetic = 0;
  let nonCosmetic = 0;
  let rawCosmeticHeading = 0;
  let rawDifferenceHeading = 0;
  const excludedHeaderSummaries = [];
  const nonCosmeticLabels = [];

  let match;
  HEADING_RE.lastIndex = 0;
  while ((match = HEADING_RE.exec(html)) !== null) {
    const cls = match[1];
    const label = normalizeLabel(match[2]);
    if (cls === 'difference-cosmetic-heading') {
      rawCosmeticHeading += 1;
    } else {
      rawDifferenceHeading += 1;
    }
    if (!NUMBERED_LABEL_RE.test(label)) {
      // The non-numbered heading is the report header (First VI/Second VI), not
      // a difference; record it for transparency and skip.
      excludedHeaderSummaries.push(label.slice(0, 120));
      continue;
    }
    if (cls === 'difference-cosmetic-heading') {
      cosmetic += 1;
    } else {
      nonCosmetic += 1;
      nonCosmeticLabels.push(label);
    }
  }

  return {
    schema: 'vi-history-suite/labview-diff-report-counts@v1',
    total,
    cosmetic,
    nonCosmetic,
    consistent: cosmetic + nonCosmetic === total,
    byClass: {
      cosmeticHeading: rawCosmeticHeading,
      differenceHeading: rawDifferenceHeading
    },
    excludedHeaderSummaries,
    // Non-cosmetic labels let a consumer spot appearance-worded headings LabVIEW
    // class-tags as non-cosmetic (e.g. "Window Size/Appearance"), the exact
    // granularity nuance the scorer surfaces.
    nonCosmeticLabels
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: labviewDiffReportParser.mjs <report.html>');
    process.exit(2);
  }
  const counts = parseLabviewDiffReportCounts(fs.readFileSync(path, 'utf8'));
  console.log(JSON.stringify(counts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
