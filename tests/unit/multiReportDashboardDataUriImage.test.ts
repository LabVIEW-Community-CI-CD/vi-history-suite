import { describe, expect, it } from 'vitest';

import { decodeDataUriImage } from '../../src/dashboard/multiReportDashboardDataUriImage';

function pngDataUri(): string {
  // 1x1 transparent PNG
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${base64}`;
}

describe('decodeDataUriImage', () => {
  it('decodes a PNG data URI into bytes, extension, and content hash', () => {
    const decoded = decodeDataUriImage(pngDataUri());
    expect(decoded).toBeDefined();
    expect(decoded?.extension).toBe('png');
    expect(decoded?.data.length).toBeGreaterThan(0);
    expect(decoded?.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalizes jpeg to a jpg extension', () => {
    const decoded = decodeDataUriImage('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD');
    expect(decoded?.extension).toBe('jpg');
  });

  it('tolerates whitespace after base64, (LabVIEW single-file reports)', () => {
    const decoded = decodeDataUriImage(pngDataUri().replace('base64,', 'base64, '));
    expect(decoded).toBeDefined();
    expect(decoded?.extension).toBe('png');
  });

  it('returns undefined for non-data-URI sources', () => {
    expect(decodeDataUriImage('report_files/bd_0.png')).toBeUndefined();
    expect(decodeDataUriImage('')).toBeUndefined();
  });

  it('returns undefined for an empty base64 payload', () => {
    expect(decodeDataUriImage('data:image/png;base64,')).toBeUndefined();
  });

  it('is content-addressed: equal bytes hash equally, different bytes differ', () => {
    const a = decodeDataUriImage(pngDataUri());
    const b = decodeDataUriImage(pngDataUri());
    const c = decodeDataUriImage('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD');
    expect(a?.contentHash).toBe(b?.contentHash);
    expect(a?.contentHash).not.toBe(c?.contentHash);
  });
});
