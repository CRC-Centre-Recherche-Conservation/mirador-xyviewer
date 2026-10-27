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

/**
 * Strip tags and escape the rest, for non-React string contexts only
 * (React already escapes text children).
 */
export function sanitizeText(text: string): string {
  // Remove any HTML tags
  const stripped = text.replace(/<[^>]*>/g, '');
  // Escape remaining special characters
  return escapeHtml(stripped);
}

/**
 * Validate Content-Type header against allowlist
 */
export function validateContentType(contentType: string | null, allowedTypes: readonly string[]): boolean {
  if (!contentType) return false;
  const baseMime = contentType.split(';')[0].trim().toLowerCase();
  return allowedTypes.some(allowed => baseMime === allowed || baseMime.startsWith(allowed.replace('/*', '/')));
}
