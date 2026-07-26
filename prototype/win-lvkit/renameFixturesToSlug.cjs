#!/usr/bin/env node
// One-shot migration: rename flat correlation fixtures (basename-lowercased) to the repo-prefixed
// manifest slug (e.g. `prepareiesource.labview-diff-report.html` -> `af-prepareiesource...`) so
// fixtures are UNIQUE + discoverable across repos (icon-editor vendors actor-framework code, so
// bare basenames collide af vs ie). Also stamps each benchmark-dataset.json sample with its slug.
// Authoritative mapping key: (vi, repoTag) against all-change-pairs.json; legacy null-repo samples
// (the original 8 icon-editor fixtures) resolve against ie-only entries by vi path.
// DRY-RUN by default; pass RENAME_APPLY=1 to actually rename + rewrite the dataset.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FIX_DIR = path.join(__dirname, 'correlation-fixtures');
const MANIFEST = path.join(FIX_DIR, 'all-change-pairs.json');
const DATASET = path.join(FIX_DIR, 'benchmark-dataset.json');
const APPLY = process.env.RENAME_APPLY === '1';

const bn = (vi) => String(vi).split(/[\\/]/).pop().replace(/\.vi$/i, '').toLowerCase();

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));

// Index manifest by exact vi path and by (vi, repoTag).
const byViRepo = new Map();
const byVi = new Map();
for (const e of manifest) {
  byViRepo.set(e.vi + '\u0000' + e.repoTag, e);
  if (!byVi.has(e.vi)) byVi.set(e.vi, []);
  byVi.get(e.vi).push(e);
}

function resolveSlug(sample) {
  // 1. exact (vi, repoTag) when the sample carries a repo tag (batch-1/batch-2 samples).
  if (sample.repo) {
    const hit = byViRepo.get(sample.vi + '\u0000' + sample.repo);
    if (hit) return { slug: hit.slug, how: '(vi,repo)' };
  }
  // 2. legacy null-repo (original icon-editor fixtures): match by vi path, prefer the ie entry.
  const cands = byVi.get(sample.vi) || [];
  if (cands.length === 1) return { slug: cands[0].slug, how: 'vi-unique' };
  const ie = cands.find((c) => c.repoTag === 'ie');
  if (ie) return { slug: ie.slug, how: 'vi->ie' };
  return { slug: null, how: 'UNMAPPED', candidates: cands.map((c) => c.slug) };
}

const plan = [];
let unmapped = 0;
for (const s of dataset.samples) {
  const old = bn(s.vi);
  const r = resolveSlug(s);
  if (!r.slug) {
    unmapped++;
    plan.push({ vi: s.vi, repo: s.repo, old, slug: 'UNMAPPED', how: r.how, cands: r.candidates });
    continue;
  }
  plan.push({ vi: s.vi, repo: s.repo, old, slug: r.slug, how: r.how });
}

// Report.
console.log('sampleCount=' + dataset.samples.length + ' unmapped=' + unmapped + ' APPLY=' + APPLY);
for (const p of plan) {
  const oldFile = p.old + '.labview-diff-report.html';
  const newFile = p.slug + '.labview-diff-report.html';
  const oldExists = fs.existsSync(path.join(FIX_DIR, oldFile));
  const newExists = fs.existsSync(path.join(FIX_DIR, newFile));
  const action = p.slug === 'UNMAPPED' ? 'SKIP-UNMAPPED(' + (p.cands || []).join('|') + ')'
    : p.old === p.slug ? 'already-slug'
    : oldExists ? 'RENAME'
    : newExists ? 'already-renamed'
    : 'MISSING-SOURCE';
  console.log([action, p.repo || 'null', p.how, oldFile, '->', newFile].join('  '));
}

if (!APPLY) {
  console.log('\nDRY-RUN: set RENAME_APPLY=1 to execute.');
  process.exit(unmapped ? 2 : 0);
}
if (unmapped) {
  console.error('ABORT: ' + unmapped + ' unmapped samples; refuse to rename with an incomplete map.');
  process.exit(2);
}

// Execute renames + stamp slug onto each sample.
let renamed = 0;
for (const p of plan) {
  const oldFile = path.join(FIX_DIR, p.old + '.labview-diff-report.html');
  const newFile = path.join(FIX_DIR, p.slug + '.labview-diff-report.html');
  if (p.old !== p.slug && fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
    fs.renameSync(oldFile, newFile);
    renamed++;
  }
}
for (const s of dataset.samples) {
  const r = resolveSlug(s);
  s.slug = r.slug;
}
fs.writeFileSync(DATASET, JSON.stringify(dataset, null, 2), 'utf8');
console.log('\nAPPLIED: renamed=' + renamed + ' datasetSlugsStamped=' + dataset.samples.length);
