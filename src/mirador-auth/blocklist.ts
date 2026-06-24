/**
 * SSRF defense-in-depth for IIIF Auth: refuse to attach a credential to (or open a login
 * for) a host that is not a public unicast address. This is a SECONDARY guard — the
 * primary protection is origin scoping (`trustedOrigins` / host-driven) + CORS. A
 * client-side blocklist cannot stop DNS-rebinding or a public hostname that resolves to an
 * internal IP; it stops the obvious case: an IP literal in private / reserved / loopback /
 * link-local space (e.g. the cloud metadata endpoint `169.254.169.254`).
 */
import * as ipaddr from 'ipaddr.js';

type IpAddr = ipaddr.IPv4 | ipaddr.IPv6;

/** Host-provided extension of the default classification. */
export interface BlocklistConfig {
  /**
   * Extra hosts to ALSO block, each an exact hostname, a CIDR range (`10.0.0.0/8`), or an
   * ipaddr range name (`reserved`). Extends the defaults — e.g. block a specific public
   * range, or an internal hostname.
   */
  deny?: string[];
  /**
   * Hosts to EXEMPT from blocking (wins over `deny` and the defaults), same forms as
   * `deny`. E.g. `['loopback']` (or `['127.0.0.0/8', '::1']`) to allow local development.
   */
  allow?: string[];
}

/** Hostname from a URL, with IPv6 brackets stripped; `undefined` if unparseable / host-less. */
function hostnameOf(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (!host) return undefined;
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/**
 * Whether an IPv6 address is the deprecated IPv4-COMPATIBLE form (`::a.b.c.d`, RFC 4291): the
 * high 96 bits are zero and it is neither `::` (unspecified) nor `::1` (loopback). ipaddr.js
 * has no helper and classifies these as plain `unicast`, so without this an embedded internal
 * IPv4 (e.g. `::169.254.169.254`) would slip past the blocklist.
 */
function isIPv4Compatible(v6: ipaddr.IPv6): boolean {
  const p = v6.parts; // eight 16-bit groups
  const highZero = p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 0 && p[4] === 0 && p[5] === 0;
  const lowNonTrivial = (p[6] !== 0 || p[7] !== 0) && !(p[6] === 0 && p[7] === 1); // exclude ::1
  return highZero && lowNonTrivial;
}

/**
 * The host parsed as a classifiable IP, or `undefined` if it is a name (not an IP literal).
 * IPv4-mapped (`::ffff:a.b.c.d`) and deprecated IPv4-compatible (`::a.b.c.d`) IPv6 are unwrapped
 * to the IPv4 they actually target, so an embedded private/loopback/link-local address is
 * classified as what it really is (a classic SSRF bypass).
 */
function toClassifiable(host: string): IpAddr | undefined {
  if (!ipaddr.isValid(host)) return undefined;
  let addr: IpAddr = ipaddr.parse(host);
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      addr = v6.toIPv4Address();
    } else if (isIPv4Compatible(v6)) {
      addr = new ipaddr.IPv4([v6.parts[6] >> 8, v6.parts[6] & 0xff, v6.parts[7] >> 8, v6.parts[7] & 0xff]);
    }
  }
  return addr;
}

/** Special-use suffixes that are never publicly routable (RFC 6761/6762/8375, ICANN). */
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** Whether a (non-IP) hostname is a special-use internal name that never resolves publicly. */
function isInternalName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.+$/, '');
  return h === 'localhost' || INTERNAL_SUFFIXES.some((s) => h.endsWith(s));
}

/** Whether a `deny`/`allow` entry matches this host: CIDR, ipaddr range name, or exact host. */
function entryMatches(entry: string, host: string, addr: IpAddr | undefined): boolean {
  if (entry.includes('/')) {
    if (!addr) return false;
    let cidr: [IpAddr, number];
    try {
      cidr = ipaddr.parseCIDR(entry);
    } catch {
      return false;
    }
    // `match` throws across IP families — guard so an IPv4 CIDR simply skips an IPv6 host.
    return addr.kind() === cidr[0].kind() && addr.match(cidr);
  }
  if (addr && entry === addr.range()) return true; // range name, e.g. 'loopback'
  // Exact hostname / IP literal — strip trailing dots (FQDN form), and for a wrapped IPv6 host
  // also match the unwrapped IPv4 it targets, so an exact-IP entry can't be bypassed by notation.
  const norm = (s: string): string => s.toLowerCase().replace(/\.+$/, '');
  return norm(entry) === norm(host) || (addr !== undefined && norm(entry) === addr.toString());
}

/**
 * Whether a credential must NOT be attached to (or a login opened for) `url`'s host.
 * Default: only public unicast passes; private / reserved / loopback / link-local literals
 * are blocked. `config.allow` exempts (wins), `config.deny` extends. Fail-closed: an
 * unparseable / host-less URL is blocked.
 */
export function isBlockedHost(url: string, config: BlocklistConfig = {}): boolean {
  const host = hostnameOf(url);
  if (host === undefined) return true; // fail-closed

  const addr = toClassifiable(host);

  if (config.allow?.some((e) => entryMatches(e, host, addr))) return false;
  if (config.deny?.some((e) => entryMatches(e, host, addr))) return true;

  // Default: a non-public IP literal is blocked; a name is blocked only if special-use internal.
  return addr ? addr.range() !== 'unicast' : isInternalName(host);
}
