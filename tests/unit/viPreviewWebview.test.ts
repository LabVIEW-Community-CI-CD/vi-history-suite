import { describe, expect, it } from 'vitest';

import {
  buildViPreviewWebviewHtml,
  injectPreviewCsp
} from '../../src/reporting/viPreview/viPreviewWebview';

const CSP_MARKER = 'Content-Security-Policy';

describe('injectPreviewCsp', () => {
  it('inserts the CSP meta into an uppercase LabVIEW <HEAD>', () => {
    const labview = '<HTML>\n<HEAD>\n<TITLE>Foo.vi</TITLE>\n</HEAD>\n<BODY>x</BODY>\n</HTML>';
    const out = injectPreviewCsp(labview);

    expect(out).toContain(CSP_MARKER);
    // Meta lands immediately after the head open tag, before the title.
    expect(out.indexOf(CSP_MARKER)).toBeGreaterThan(out.indexOf('<HEAD>'));
    expect(out.indexOf(CSP_MARKER)).toBeLessThan(out.indexOf('<TITLE>'));
    expect(out).toContain('<TITLE>Foo.vi</TITLE>');
  });

  it('prepends the CSP meta when no head element is present', () => {
    const out = injectPreviewCsp('<BODY>only</BODY>');
    expect(out.indexOf(CSP_MARKER)).toBeLessThan(out.indexOf('<BODY>'));
  });
});

describe('buildViPreviewWebviewHtml', () => {
  it('returns the CSP-hardened LabVIEW document for the rendered state (VHS-REQ-659.9)', () => {
    const html = buildViPreviewWebviewHtml({
      kind: 'rendered',
      labviewHtml: '<HTML><HEAD></HEAD><BODY><IMG src="data:image/png;base64,AAAA"></BODY></HTML>'
    });
    expect(html).toContain(CSP_MARKER);
    expect(html).toContain('img-src data:');
    expect(html).toContain('script-src \'none\'');
    expect(html).toContain('data:image/png;base64,AAAA');
  });

  it('renders a themed loading document with a CSP and optional detail (VHS-REQ-659.9)', () => {
    const html = buildViPreviewWebviewHtml({
      kind: 'loading',
      title: 'Rendering VI preview…',
      detail: 'Starting LabVIEW container'
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(CSP_MARKER);
    expect(html).toContain('Rendering VI preview…');
    expect(html).toContain('Starting LabVIEW container');
  });

  it('escapes error messages in the error document (VHS-REQ-659.9)', () => {
    const html = buildViPreviewWebviewHtml({
      kind: 'error',
      title: 'Preview failed',
      message: '<script>alert(1)</script> & fail'
    });
    expect(html).toContain(CSP_MARKER);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; fail');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
