import { describe, expect, it } from 'vitest';
import { safeExternalUrl } from './safeUrl';

describe('safeExternalUrl (credits links)', () => {
  it('accepts absolute http(s) URLs, including encoded Unicode paths', () => {
    expect(safeExternalUrl('https://commons.wikimedia.org/wiki/File:Tem_phi%E1%BA%BFu.jpg')).toBe('https://commons.wikimedia.org/wiki/File:Tem_phi%E1%BA%BFu.jpg');
    expect(safeExternalUrl('http://example.org/a')).toBe('http://example.org/a');
    expect(safeExternalUrl('  https://creativecommons.org/licenses/by-sa/2.0/ ')).toBe('https://creativecommons.org/licenses/by-sa/2.0/');
  });
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example/x',
    '/relative/path',
    'commons.wikimedia.org/wiki/x',
    'https://user:pass@evil.example/',
    'https://',
    'ftp://example.org/x',
    '',
  ])('rejects %j', (u) => {
    expect(safeExternalUrl(u)).toBeNull();
  });
  it('rejects non-strings and absurdly long values', () => {
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(42)).toBeNull();
    expect(safeExternalUrl('https://a.example/' + 'x'.repeat(3000))).toBeNull();
  });
});
