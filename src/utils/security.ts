/**
 * Security utilities for safe data handling
 */

/** Allowed URL protocols */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Validate that a URL is safe to fetch
 * Only allows http/https protocols
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Escape HTML special characters, for non-React string contexts only
 * (React already escapes text children).
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
}

const MAX_STRIP_PASSES = 16;

/** Remove every `<…>` run in one linear scan (a regex would backtrack on long `<<<` runs). */
function stripTagsOnce(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<', i);
    if (open === -1) break;
    const close = text.indexOf('>', open + 1);
    // No closing '>' anywhere after: nothing more can be stripped.
    if (close === -1) break;
    out += text.slice(i, open);
    i = close + 1;
  }
  return out + text.slice(i);
}

/**
 * Strip tags and escape the rest, for non-React string contexts only
 * (React already escapes text children).
 */
export function sanitizeText(text: string): string {
  // Escape remaining special characters
  return escapeHtml(stripTags(text));
}

/**
 * Strip HTML tags in linear time, without escaping (for text React renders as text).
 * Repeats until stable, so removing one tag cannot assemble another (bounded passes).
 */
export function stripTags(text: string): string {
  let stripped = text;
  for (let pass = 0; pass < MAX_STRIP_PASSES; pass++) {
    const next = stripTagsOnce(stripped);
    if (next === stripped) break;
    stripped = next;
  }
  return stripped;
}

/**
 * Validate Content-Type header against allowlist
 */
export function validateContentType(contentType: string | null, allowedTypes: readonly string[]): boolean {
  if (!contentType) return false;
  const baseMime = contentType.split(';')[0].trim().toLowerCase();
  return allowedTypes.some(allowed => baseMime === allowed || baseMime.startsWith(allowed.replace('/*', '/')));
}
