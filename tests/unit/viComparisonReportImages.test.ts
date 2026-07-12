/**
 * Unit tests for the overview difference-image extraction/selection helpers
 * that back inline visual diffs in the review comment.
 */

import { describe, expect, it } from 'vitest';

import {
  collectOverviewImageUploads,
  parseImageDataUri
} from '../../src/semantic/viComparisonReportImages';

describe('parseImageDataUri', () => {
  it('parses a base64 image data URI into content type and payload', () => {
    expect(parseImageDataUri('data:image/png;base64,QUJD')).toEqual({
      contentType: 'image/png',
      base64: 'QUJD'
    });
  });

  it('strips whitespace and newlines from the base64 payload', () => {
    expect(parseImageDataUri('data:image/png;base64,QU\n  JD')).toEqual({
      contentType: 'image/png',
      base64: 'QUJD'
    });
  });

  it('returns null for a non-data-URI src such as a file path', () => {
    expect(parseImageDataUri('assets/block.png')).toBeNull();
  });

  it('returns null for a non-image or empty data URI', () => {
    expect(parseImageDataUri('data:text/plain;base64,QUJD')).toBeNull();
    expect(parseImageDataUri('data:image/png;base64,   ')).toBeNull();
  });
});

describe('collectOverviewImageUploads', () => {
  const dataUri = (base64: string): string => `data:image/png;base64,${base64}`;

  it('decodes overview images and labels base/changed for two-image sections', () => {
    const uploads = collectOverviewImageUploads([
      {
        caption: 'Block Diagram',
        images: [{ sourceRelativePath: dataUri('QQ==') }, { sourceRelativePath: dataUri('Qg==') }]
      }
    ]);

    expect(uploads).toEqual([
      { caption: 'Block Diagram — base', contentType: 'image/png', base64: 'QQ==' },
      { caption: 'Block Diagram — changed', contentType: 'image/png', base64: 'Qg==' }
    ]);
  });

  it('skips non-data-URI sources (a non-self-contained report)', () => {
    expect(
      collectOverviewImageUploads([
        { caption: 'Front Panel', images: [{ sourceRelativePath: 'assets/fp.png' }] }
      ])
    ).toEqual([]);
  });

  it('caps the number of collected images', () => {
    const section = {
      caption: 'X',
      images: Array.from({ length: 10 }, () => ({ sourceRelativePath: dataUri('QQ==') }))
    };
    expect(collectOverviewImageUploads([section], 3)).toHaveLength(3);
  });

  it('falls back to a generic caption when the section caption is empty', () => {
    const uploads = collectOverviewImageUploads([
      { caption: '   ', images: [{ sourceRelativePath: dataUri('QQ==') }] }
    ]);
    expect(uploads[0]?.caption).toBe('Comparison');
  });
});
