import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const artifactPath =
  'docs/product/work-item-0011-docs-implementation-alignment-control-plane-2026-05-16';

interface AlignmentControlPlane {
  schema: string;
  triageProcess?: {
    authority26514?: {
      preferredCommand?: string;
      evidenceDir?: string;
      requiredForLabels?: string[];
      requiredWorkItemSections?: string[];
      disallowedSoleAuthoritySources?: string[];
      rawRepoWideScanPolicy?: string;
    };
    workItemTemplate?: {
      requiredSections?: Array<{ heading: string; rule: string }>;
    };
  };
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

describe('alignment control-plane process docs', () => {
  it('requires staged 26514 authority evidence for user-information work-item triage', () => {
    const markdown = readText(`${artifactPath}.md`);
    const controlPlane = readJson<AlignmentControlPlane>(`${artifactPath}.json`);
    const authority26514 = controlPlane.triageProcess?.authority26514;
    const workItemTemplate = controlPlane.triageProcess?.workItemTemplate;

    expect(controlPlane.schema).toBe('vi-history-suite/alignment-control-plane-work-items@v1');
    expect(markdown).toContain('## Alignment Triage Template');
    expect(markdown).toContain('`npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514`');
    expect(markdown).toContain('`VIHS_ASSURANCE_SKILL_ROOT=/home/sergio/repos/gl/repo-standards-review`');
    expect(markdown).toContain('Raw repo-wide 26514 scans are exploratory only');
    expect(markdown).toContain('Never cite `.cache/` as the sole user-information authority source');

    expect(authority26514).toMatchObject({
      preferredCommand: 'npm run assurance:26514:authority -- --evidence-dir /tmp/vihs-assurance-26514',
      evidenceDir: '/tmp/vihs-assurance-26514',
      rawRepoWideScanPolicy: 'exploratory-only'
    });
    expect(authority26514?.requiredForLabels).toEqual(
      expect.arrayContaining(['lane::user-information', 'standards-review'])
    );
    expect(authority26514?.requiredWorkItemSections).toEqual(
      expect.arrayContaining(['26514 Authority Evidence', 'Non-Authority Evidence Boundary'])
    );
    expect(authority26514?.disallowedSoleAuthoritySources).toEqual(
      expect.arrayContaining(['.cache/', 'docs-workbench-evidence/', 'wiki-workbench-evidence/'])
    );
    expect(workItemTemplate?.requiredSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          heading: '26514 Authority Evidence',
          rule: expect.stringContaining('staged `assurance:26514:authority`')
        }),
        expect.objectContaining({
          heading: 'Non-Authority Evidence Boundary',
          rule: expect.stringContaining('`.cache/`')
        })
      ])
    );
  });
});
