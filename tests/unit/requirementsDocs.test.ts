import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      const nextCharacter = text[index + 1];
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && character === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }

      currentRow.push(currentCell);
      currentCell = '';

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function parseRtmRows(): Array<Record<string, string>> {
  const rows = parseCsv(readText('docs/requirements/rtm.csv'));
  const [header, ...body] = rows;

  return body.map((row) => {
    const record: Record<string, string> = {};

    header.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });

    return record;
  });
}

function extractPlanIds(text: string): string[] {
  return [...text.matchAll(/`(TEST-[A-Z]+-\d+)`/g)].map((match) => match[1]);
}

function extractSrsRequirementIds(text: string): string[] {
  return [...text.matchAll(/\|\s(VHS-REQ-\d+)\s\|/g)].map((match) => match[1]);
}

describe('requirements documentation coherence', () => {
  it('keeps the system and software requirement package split explicit', () => {
    const syrs = readText('docs/requirements/syrs.md');
    const srs = readText('docs/requirements/srs.md');
    const informationItemMap = readText('docs/information-item-map.md');

    expect(syrs).toContain('# System Requirements Specification');
    expect(srs).toContain('Parent system specification: [docs/requirements/syrs.md](./syrs.md)');
    expect(srs).toContain('This document refines the software behavior within the system boundary');
    expect(informationItemMap).toContain('| System Specification | `docs/requirements/syrs.md` |');
    expect(informationItemMap).toContain('| Software Specification | `docs/requirements/srs.md` |');
  });

  it('keeps the SRS and RTM on the same requirement-id set', () => {
    const srsIds = new Set(extractSrsRequirementIds(readText('docs/requirements/srs.md')));
    const rtmIds = new Set(parseRtmRows().map((row) => row.ReqID));

    expect([...srsIds].sort()).toEqual([...rtmIds].sort());
  });

  it('keeps the governed RTM verification ids and test-plan ids in sync', () => {
    const planIds = new Set(extractPlanIds(readText('docs/testing/test-plan.md')));
    const rtmIds = new Set(
      parseRtmRows().flatMap((row) =>
        row.TestID.split(';')
          .map((testId) => testId.trim())
          .filter((testId) => testId.length > 0)
      )
    );

    expect([...rtmIds].sort()).toEqual([...planIds].sort());
  });

  it('keeps the research-facing dashboard and history-panel trace surfaces current', () => {
    const alignment = readText('docs/research/authoritative/research-alignment.md');
    const currentState = readText('docs/product/current-state.md');
    const implementationIndex = JSON.parse(
      readText('docs/research/authoritative/research-implementation-index.json')
    ) as {
      implementationState: Array<{
        surface: string;
        evidence: string[];
        requirements: string[];
      }>;
    };

    const historySurface = implementationIndex.implementationState.find(
      (entry) => entry.surface === 'history-panel-and-review-actions'
    );
    const dashboardSurface = implementationIndex.implementationState.find(
      (entry) => entry.surface === 'multi-report-developer-dashboard-for-three-plus-commits'
    );

    expect(currentState).toContain('truncated auto/capped window');
    expect(currentState).toContain('latest-dashboard-run.json');

    expect(alignment).toContain('history-window packet');
    expect(alignment).toContain('latest-run discovery');

    expect(historySurface?.evidence).toContain('src/ui/historyPanel.ts');
    expect(historySurface?.requirements).toContain('VHS-REQ-387');

    expect(dashboardSurface?.evidence).toContain('src/dashboard/dashboardLatestRun.ts');
    expect(dashboardSurface?.requirements).toContain('VHS-REQ-388');
    expect(dashboardSurface?.requirements).toContain('VHS-REQ-389');
  });
});
