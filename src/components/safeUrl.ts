/**
 * Returns a URL that is safe to render as a clickable external link, or null. Only absolute http(s)
 * URLs without embedded credentials are accepted — never `javascript:`, `data:`, `vbscript:`, `file:`,
 * protocol-relative or relative URLs — even though the credits come from a repository file.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || !url.hostname) return null;
  return url.href;
}
