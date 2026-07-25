#!/usr/bin/env node
// prototype/primitiveSignatureValidator.mjs
//
// #2376 (primitive-mapping-pack): validate a candidate `.lvkit/primitives.json`
// against WIN's cleanroom `primitive-census.json` SIGNATURE CONTRACT.
//
// A mapping is "signature-faithful" iff its terminals match the census entry on
// (index + direction + type). This is CONDITION (1) for a SHIPPABLE resolution
// stub (bus ANSWER discussioncomment-17779896): a wrong-signature stub is worse
// than a raise -- a raise is an honest "unknown"; a wrong-signature stub
// silently misleads the structural diff (invents/erases a dataflow edge). This
// turns the census from documentation into an ENFORCED gate and pairs with the
// envelope provenance field (T1+T2 structural fidelity; T3 runtime is separate).
//
// Usage:
//   node prototype/primitiveSignatureValidator.mjs --pack <primitives.json> \
//        [--census prototype/win-lvkit/primitive-census.json]
// Exit 0 = all mapped prims signature-faithful; 1 = mismatch; 2 = usage error.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = { input: 'in', output: 'out', in: 'in', out: 'out' };
const normDir = (d) => DIR[String(d).toLowerCase()] ?? String(d);

// Accepts a census-style { value: [...], Count } wrapper or a plain array.
export function indexTerminals(terminals) {
  const arr = Array.isArray(terminals)
    ? terminals
    : terminals && Array.isArray(terminals.value)
      ? terminals.value
      : [];
  const map = new Map();
  for (const t of arr) {
    map.set(Number(t.index), {
      index: Number(t.index),
      direction: normDir(t.direction),
      type: String(t.type)
    });
  }
  return map;
}

export function compareTerminals(censusTerms, packTerms) {
  const c = indexTerminals(censusTerms);
  const p = indexTerminals(packTerms);
  const mismatches = [];
  for (const [idx, ct] of c) {
    const pt = p.get(idx);
    if (!pt) {
      mismatches.push(`missing pack terminal index ${idx} (census ${ct.direction} ${ct.type})`);
      continue;
    }
    if (pt.direction !== ct.direction) {
      mismatches.push(`index ${idx} direction pack=${pt.direction} census=${ct.direction}`);
    }
    if (pt.type !== ct.type) {
      mismatches.push(`index ${idx} type pack=${pt.type} census=${ct.type}`);
    }
  }
  for (const idx of p.keys()) {
    if (!c.has(idx)) mismatches.push(`extra pack terminal index ${idx} not in census`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function validatePackAgainstCensus(pack, census) {
  const censusById = new Map();
  for (const e of census.primitives || []) censusById.set(String(e.prim_id), e);
  const packPrims = pack.primitives || {};
  const results = [];
  for (const id of Object.keys(packPrims)) {
    const ce = censusById.get(String(id));
    if (!ce) {
      results.push({ prim_id: id, status: 'UNKNOWN', mismatches: [`id ${id} not in census`] });
      continue;
    }
    if (ce.addressable === false) {
      results.push({
        prim_id: id,
        status: 'UNADDRESSABLE',
        mismatches: [`census marks id ${id} addressable=false (id-0 holdout) -- not shippable`]
      });
      continue;
    }
    const cmp = compareTerminals(ce.terminals, packPrims[id].terminals);
    results.push({
      prim_id: id,
      status: cmp.ok ? 'FAITHFUL' : 'MISMATCH',
      mismatches: cmp.mismatches
    });
  }
  const uncovered = [];
  for (const e of census.primitives || []) {
    if (e.addressable !== false && !packPrims[String(e.prim_id)]) uncovered.push(String(e.prim_id));
  }
  const ok = results.length > 0 && results.every((r) => r.status === 'FAITHFUL');
  return { ok, results, uncovered };
}

function main() {
  const args = process.argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const censusPath = get('--census') || 'prototype/win-lvkit/primitive-census.json';
  const packPath = get('--pack');
  if (!packPath) {
    console.error('usage: primitiveSignatureValidator.mjs --pack <primitives.json> [--census <census.json>]');
    process.exit(2);
  }
  const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const { ok, results, uncovered } = validatePackAgainstCensus(pack, census);
  for (const r of results) {
    const tail = r.mismatches.length ? ` -- ${r.mismatches.join('; ')}` : '';
    console.log(`  [${r.status}] prim ${r.prim_id}${tail}`);
  }
  if (uncovered.length) {
    console.log(`  uncovered addressable census ids (not in pack): ${uncovered.join(', ')}`);
  }
  console.log(ok ? 'SIGNATURE-FAITHFUL: PASS' : 'SIGNATURE-FAITHFUL: FAIL');
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
