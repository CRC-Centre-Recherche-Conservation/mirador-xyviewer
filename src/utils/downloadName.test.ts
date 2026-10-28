import { describe, it, expect } from 'vitest';
import {
  filenameFromContentDisposition,
  filenameFromLabel,
  hasExtension,
  resolveDownloadName,
  sanitizeFileName,
} from './downloadName';

describe('downloadName', () => {
  it('parses filename* (RFC 5987) before filename', () => {
    expect(
      filenameFromContentDisposition(`attachment; filename="a.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9.spa`)
    ).toBe('résumé.spa');
  });

  it('parses quoted and bare filename, strips path parts', () => {
    expect(filenameFromContentDisposition('attachment; filename="x y.spa"')).toBe('x y.spa');
    expect(filenameFromContentDisposition('attachment; filename=x.spa')).toBe('x.spa');
    expect(filenameFromContentDisposition('attachment; filename="../../etc/passwd"')).toBe('passwd');
    expect(filenameFromContentDisposition(null)).toBe('');
  });

  it('sanitizes control chars and caps length keeping the extension', () => {
    expect(sanitizeFileName('a\u0000b\u001fc.spa')).toBe('a_b_c.spa');
    const long = sanitizeFileName(`${'a'.repeat(300)}.spa`);
    expect(long.length).toBe(100);
    expect(long.endsWith('.spa')).toBe(true);
  });

  it('hasExtension accepts short alphanumeric extensions', () => {
    expect(hasExtension('export.spectra')).toBe(true);
    expect(hasExtension('export')).toBe(false);
  });

  it('takes a leading filename-like token from a label', () => {
    expect(filenameFromLabel('GRE76-FORS-0004.spa, raw file')).toBe('GRE76-FORS-0004.spa');
    expect(filenameFromLabel('scan.csv')).toBe('scan.csv');
    expect(filenameFromLabel('Raw file')).toBe('');
    expect(filenameFromLabel('v1.2 spectrum raw')).toBe('');
    expect(filenameFromLabel('toolongext.abcdefghij, x')).toBe('');
  });

  it('replaces bidi and invisible format characters, and strips trailing dots/spaces', () => {
    expect(
      filenameFromContentDisposition(`attachment; filename*=UTF-8''spectrum%E2%80%AEvsc.exe`)
    ).toBe('spectrum_vsc.exe');
    expect(filenameFromLabel('scan\u202Egpj.exe, raw')).toBe('scan_gpj.exe');
    expect(sanitizeFileName('a\u202Eb\u200Fc\u2066d.spa')).toBe('a_b_c_d.spa');
    expect(sanitizeFileName('scan.spa. . ')).toBe('scan.spa');
  });

  it('resolves header, then URL name, then label, then fallback', () => {
    expect(resolveDownloadName({ urlName: 'download.php', headerName: 'scan.spa' })).toBe('scan.spa');
    expect(resolveDownloadName({ urlName: 'a.csv' })).toBe('a.csv');
    expect(resolveDownloadName({ urlName: 'raw', headerName: 'h.spa', label: 'l.spa' })).toBe('h.spa');
    expect(resolveDownloadName({ urlName: 'raw', label: 'l.spa, raw' })).toBe('l.spa');
    expect(resolveDownloadName({ urlName: 'raw', label: 'Raw', fallback: 'x-raw.txt' })).toBe('x-raw.txt');
    expect(resolveDownloadName({ urlName: '' })).toBe('download');
  });
});
