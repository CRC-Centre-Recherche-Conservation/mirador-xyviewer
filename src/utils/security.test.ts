import { describe, it, expect } from 'vitest';
import {
  isValidUrl,
  escapeHtml,
  sanitizeText,
  validateContentType,
} from './security';

describe('security utils', () => {
  describe('isValidUrl', () => {
    it('should accept valid http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path')).toBe(true);
      expect(isValidUrl('http://example.com:8080/path?query=1')).toBe(true);
    });

    it('should accept valid https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path/to/resource')).toBe(true);
      expect(isValidUrl('https://sub.example.com:443/path')).toBe(true);
    });

    it('should reject javascript: protocol', () => {
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: protocol', () => {
      expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject file: protocol', () => {
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });

    it('should reject ftp: protocol', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('://missing-protocol.com')).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('should escape forward slashes', () => {
      expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
    });

    it('should escape multiple characters', () => {
      expect(escapeHtml('<div class="test">&</div>')).toBe(
        '&lt;div class=&quot;test&quot;&gt;&amp;&lt;&#x2F;div&gt;'
      );
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle strings without special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('sanitizeText', () => {
    it('should strip HTML tags', () => {
      expect(sanitizeText('<p>Hello</p>')).toBe('Hello');
    });

    it('should strip script tags', () => {
      expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
    });

    it('should strip nested tags', () => {
      expect(sanitizeText('<div><span>text</span></div>')).toBe('text');
    });

    it('should escape remaining special characters', () => {
      expect(sanitizeText('<p>A & B</p>')).toBe('A &amp; B');
    });

    it('should handle self-closing tags', () => {
      expect(sanitizeText('line1<br/>line2')).toBe('line1line2');
    });

    it('should handle malformed tags', () => {
      expect(sanitizeText('<div<nested>')).toBe('');
    });
  });

  describe('validateContentType', () => {
    const allowedTypes = ['text/csv', 'text/plain', 'application/json'] as const;

    it('should accept exact matches', () => {
      expect(validateContentType('text/csv', allowedTypes)).toBe(true);
      expect(validateContentType('text/plain', allowedTypes)).toBe(true);
      expect(validateContentType('application/json', allowedTypes)).toBe(true);
    });

    it('should handle charset parameter', () => {
      expect(validateContentType('text/csv; charset=utf-8', allowedTypes)).toBe(true);
      expect(validateContentType('application/json; charset=UTF-8', allowedTypes)).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(validateContentType('TEXT/CSV', allowedTypes)).toBe(true);
      expect(validateContentType('Text/Plain', allowedTypes)).toBe(true);
    });

    it('should reject non-allowed types', () => {
      expect(validateContentType('text/html', allowedTypes)).toBe(false);
      expect(validateContentType('application/xml', allowedTypes)).toBe(false);
    });

    it('should reject null content type', () => {
      expect(validateContentType(null, allowedTypes)).toBe(false);
    });

    it('should handle wildcard types', () => {
      const wildcardTypes = ['text/*', 'application/json'] as const;
      expect(validateContentType('text/csv', wildcardTypes)).toBe(true);
      expect(validateContentType('text/plain', wildcardTypes)).toBe(true);
      expect(validateContentType('application/json', wildcardTypes)).toBe(true);
      expect(validateContentType('application/xml', wildcardTypes)).toBe(false);
    });
  });
});
