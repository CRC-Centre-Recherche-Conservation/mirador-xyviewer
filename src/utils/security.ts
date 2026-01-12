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
 * Escape HTML to prevent XSS attacks
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
 * Sanitize text content, stripping any potential HTML
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

/** Allowed HTML tags for safe HTML rendering */
const SAFE_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'u', 's', 'strike',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'a', 'span', 'div',
  'sub', 'sup',
]);

/** Allowed attributes for safe HTML (tag -> allowed attrs) */
const SAFE_ATTRIBUTES: Record<string, Set<string>> = {
  'a': new Set(['href', 'title', 'target', 'rel']),
  'span': new Set(['class']),
  'div': new Set(['class']),
};

/**
 * Sanitize HTML to allow only safe tags and attributes
 * Prevents XSS while preserving basic formatting
 */
export function sanitizeHtml(html: string): string {
  // Parse using a temporary element (browser-safe approach)
  if (typeof document === 'undefined') {
    // Server-side: fall back to stripping all HTML
    return sanitizeText(html);
  }

  const temp = document.createElement('div');
  temp.innerHTML = html;

  sanitizeNode(temp);

  return temp.innerHTML;
}

/**
 * Recursively sanitize a DOM node
 */
function sanitizeNode(node: Node): void {
  const nodesToRemove: Node[] = [];

  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      const tagName = element.tagName.toLowerCase();

      // Remove disallowed tags but keep their text content
      if (!SAFE_TAGS.has(tagName)) {
        nodesToRemove.push(child);
        continue;
      }

      // Remove disallowed attributes
      const allowedAttrs = SAFE_ATTRIBUTES[tagName] || new Set();
      for (const attr of Array.from(element.attributes)) {
        if (!allowedAttrs.has(attr.name)) {
          element.removeAttribute(attr.name);
        }
      }

      // Special handling for <a> tags - validate href
      if (tagName === 'a') {
        const href = element.getAttribute('href');
        if (href && !isValidUrl(href)) {
          // Replace dangerous link with text
          const text = document.createTextNode(element.textContent || '');
          node.replaceChild(text, element);
          continue;
        }
        // Force external links to have safe attributes
        element.setAttribute('rel', 'noopener noreferrer');
      }

      // Recursively sanitize children
      sanitizeNode(element);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Remove HTML comments
      nodesToRemove.push(child);
    }
  }

  // Remove nodes after iteration to avoid modifying during loop
  for (const nodeToRemove of nodesToRemove) {
    // For elements, preserve their text content
    if (nodeToRemove.nodeType === Node.ELEMENT_NODE && nodeToRemove.textContent) {
      const text = document.createTextNode(nodeToRemove.textContent);
      node.replaceChild(text, nodeToRemove);
    } else {
      node.removeChild(nodeToRemove);
    }
  }
}
