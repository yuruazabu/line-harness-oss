/**
 * Escaping regressions for the HTML we generate outside React.
 *
 * These pages are served from the tenant's own origin, which also serves the
 * admin console. An injection here is not cosmetic: script running on this
 * origin can call the admin API with the session cookie.
 */
import { describe, it, expect } from 'vitest';
import { buildOgHtml } from './og-html.js';

describe('buildOgHtml', () => {
  it('escapes quotes so a title cannot break out of the meta attribute', () => {
    const html = buildOgHtml({
      title: '" onload="alert(1)',
      siteName: 'x',
      url: 'https://acme.lhrn.jp/f/1',
    });
    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('&quot; onload=&quot;alert(1)');
  });

  it('escapes an image URL supplied by the operator', () => {
    const html = buildOgHtml({
      title: 't',
      siteName: 'x',
      url: 'https://acme.lhrn.jp/f/1',
      imageUrl: 'https://e.example/a.png" onerror="alert(1)',
    });
    expect(html).not.toMatch(/onerror="alert\(1\)"/);
  });
});
