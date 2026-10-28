/**
 * File names for downloads of resources whose URL or format gives no usable extension.
 */

const MAX_NAME_LENGTH = 100;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;
/** Bidi and invisible format characters that can disguise a file's real extension. */
const FORMAT_CHARS = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

/** Whether a name ends with a short alphanumeric extension. */
export function hasExtension(name: string): boolean {
  return HAS_EXTENSION.test(name);
}
/** A leading `name.ext` token, ended by a comma, whitespace or the end of the label. */
const LABEL_FILENAME = /^([^\s,/\\]+\.(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{1,8})(?=[\s,]|$)/;

/** Strip path parts, control characters and reserved characters; cap the length. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  let out = '';
  for (const ch of base) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 || FORMAT_CHARS.test(ch) || '<>:"|?*'.includes(ch) ? '_' : ch;
  }
  // Windows silently drops trailing dots and spaces, which can change the extension.
  out = out.trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (out.length > MAX_NAME_LENGTH) {
    const ext = out.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? '';
    out = out.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return out;
}

/** File name from a Content-Disposition header (RFC 6266; `filename*` per RFC 5987 wins). */
export function filenameFromContentDisposition(header: string | null | undefined): string {
  if (!header) return '';
  const star = header.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (star) {
    try {
      const name = sanitizeFileName(decodeURIComponent(star[2].trim()));
      if (name) return name;
    } catch {
      /* malformed escape: fall back to plain filename */
    }
  }
  const plain = header.match(/filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i);
  return plain ? sanitizeFileName((plain[1] ?? plain[2]).replace(/\\(.)/g, '$1').trim()) : '';
}

/** A leading filename-like token of a label ("scan.spa, raw file" -> "scan.spa"). */
export function filenameFromLabel(label: string | undefined): string {
  const token = label?.trim().match(LABEL_FILENAME)?.[1];
  return token ? sanitizeFileName(token) : '';
}

/**
 * Pick the download name: the response's Content-Disposition name (RFC 6266), else the
 * URL's file name when it has an extension, else a filename-like label token, else `fallback`.
 */
export function resolveDownloadName(opts: {
  urlName: string;
  headerName?: string;
  label?: string;
  fallback?: string;
}): string {
  const { urlName, headerName, label, fallback } = opts;
  return (
    headerName ||
    (hasExtension(urlName) ? sanitizeFileName(urlName) : '') ||
    filenameFromLabel(label) || sanitizeFileName(fallback || urlName) ||
    'download'
  );
}
