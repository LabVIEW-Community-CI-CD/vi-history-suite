import { describe, expect, it } from 'vitest';

import {
  ensureTrailingSlash,
  enableLazyImageLoading
} from '../../src/reporting/comparisonReportPanelHtmlPostProcessing';

describe('ensureTrailingSlash', () => {
  it('appends a slash when missing', () => {
    expect(ensureTrailingSlash('vscode-webview://abc/reports')).toBe('vscode-webview://abc/reports/');
  });

  it('leaves an already-terminated value unchanged', () => {
    expect(ensureTrailingSlash('vscode-webview://abc/reports/')).toBe('vscode-webview://abc/reports/');
  });

  it('handles an empty string', () => {
    expect(ensureTrailingSlash('')).toBe('/');
  });
});

describe('enableLazyImageLoading', () => {
  it('adds loading="lazy" to img tags that lack it', () => {
    expect(enableLazyImageLoading('<img src="a.png"><img src="b.png">')).toBe(
      '<img loading="lazy" src="a.png"><img loading="lazy" src="b.png">'
    );
  });

  it('does not duplicate loading on tags that already declare it', () => {
    expect(enableLazyImageLoading('<img loading="eager" src="a.png">')).toBe(
      '<img loading="eager" src="a.png">'
    );
  });

  it('matches img tags case-insensitively (replacement normalizes to lowercase tag)', () => {
    expect(enableLazyImageLoading('<IMG src="a.png">')).toBe('<img loading="lazy" src="a.png">');
  });

  it('leaves html without images unchanged', () => {
    expect(enableLazyImageLoading('<p>no images</p>')).toBe('<p>no images</p>');
  });
});
