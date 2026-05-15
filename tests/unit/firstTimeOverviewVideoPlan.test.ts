import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');

type OverviewVideoSlot = {
  anchor: string;
  title: string;
  topic: string;
  assetStatus: 'planned' | 'ready';
  videoUrl: string | null;
  thumbnailPath: string | null;
};

type OverviewVideoPlan = {
  status: string;
  overviewPolicy: {
    stableAnchorsRequired: boolean;
    placeholderVideoUrlsAllowed: boolean;
    fakeThumbnailsAllowed: boolean;
    brokenMediaAllowed: boolean;
    publishMediaOnlyWhenAssetState: string;
  };
  overviewSlots: OverviewVideoSlot[];
};

const expectedAnchors = [
  'video-install-and-prepare',
  'video-validate-runtime',
  'video-first-compare',
  'video-read-report-evidence',
  'video-troubleshooting'
];

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readPlan(): OverviewVideoPlan {
  return JSON.parse(
    readText('docs/product/first-time-overview-video-plan-2026-05-15.json')
  ) as OverviewVideoPlan;
}

function readmeVideoSection(): string {
  const readme = readText('README.md');
  const start = readme.indexOf('### Video Walkthroughs');
  const end = readme.indexOf('## Details', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return readme.slice(start, end);
}

function expectNoPrematureMedia(surface: string): void {
  expect(surface).not.toMatch(/!\[[^\]]*\]\([^)]+\)/);
  expect(surface).not.toMatch(/<img\b/i);
  expect(surface).not.toMatch(/<video\b/i);
  expect(surface).not.toMatch(/<iframe\b/i);
  expect(surface).not.toMatch(/href=["'][^"']+["']/i);
  expect(surface).not.toMatch(/https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\b/i);
}

describe('first-time Overview video plan', () => {
  it('retains the planned first-time video set without pretending assets exist', () => {
    const plan = readPlan();

    expect(plan.status).toBe('planned-no-assets-yet');
    expect(plan.overviewPolicy).toMatchObject({
      stableAnchorsRequired: true,
      placeholderVideoUrlsAllowed: false,
      fakeThumbnailsAllowed: false,
      brokenMediaAllowed: false,
      publishMediaOnlyWhenAssetState: 'ready'
    });
    expect(plan.overviewSlots.map((slot) => slot.anchor)).toEqual(expectedAnchors);
    expect(plan.overviewSlots.map((slot) => slot.title)).toEqual([
      'Install And Prepare',
      'Validate Runtime',
      'First Compare',
      'Read The Report And Evidence',
      'Troubleshooting'
    ]);

    for (const slot of plan.overviewSlots) {
      expect(slot.assetStatus).toBe('planned');
      expect(slot.videoUrl).toBeNull();
      expect(slot.thumbnailPath).toBeNull();
      expect(slot.topic.trim()).not.toBe('');
    }
  });

  it('keeps README and bundled Overview anchors stable with no placeholder media', () => {
    const readmeSection = readmeVideoSection();
    const bundledOverview = readText('resources/bundled-docs/pages/overview.html');
    const syncSource = readText('scripts/syncBundledDocs.js');

    for (const anchor of expectedAnchors) {
      expect(readmeSection).toContain(`<a id="${anchor}"></a>`);
      expect(bundledOverview).toContain(`id="${anchor}"`);
      expect(syncSource).toContain(`<a id="${anchor}"></a>`);
    }

    expect(readmeSection).toMatch(/No video links or thumbnails are\s+published until/);
    expect(readmeSection).toContain('Planned first-time walkthrough');
    expect(readmeSection).toContain('Reserved follow-up walkthrough');
    expectNoPrematureMedia(readmeSection);
    expectNoPrematureMedia(bundledOverview);
  });

  it('requires real media fields only after a slot is marked ready', () => {
    const plan = readPlan();

    for (const slot of plan.overviewSlots) {
      if (slot.assetStatus === 'ready') {
        expect(slot.videoUrl).toMatch(/^https:\/\/.+/);
        expect(slot.thumbnailPath).toMatch(/^(resources|docs)\//);
      } else {
        expect(slot.videoUrl).toBeNull();
        expect(slot.thumbnailPath).toBeNull();
      }
    }
  });
});
